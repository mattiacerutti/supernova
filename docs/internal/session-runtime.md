# Session runtime

## Summary

A session is Pi's state: its entries (the transcript) and its documents (`pi.agent`, `pi.live`, `pi.usage`), plus what Supernova adds (turn records, title, worktree, context usage). The server keeps one such document per session, the contract `Session`, and streams every change to it to the browser as a Chord delta (`session.state`). The browser mirrors the document and builds its timeline from it, the way Pi's TUI renders from `Conversation.viewState()`.

There is no separate committed and live view: the active run is part of the state (`live.run`, `live.generation`, `runStart`), and the browser decides how to show it. Execution is owned by Pi's durable engine (`@earendil-works/pi-durable`): every streamed partial, tool output, and turn is committed to the session's file before it is shown, so a server restart resumes an interrupted run instead of losing it.

This document explains the design, its guarantees, and the reasoning behind its boundaries. It is intended for contributors working on sessions, streaming, checkpoints, RPC, or timeline behavior.

## Goals

1. **Server-owned execution.** Agent work continues independently of the browser that started it, and across server restarts.
2. **Parallel sessions.** Different sessions run at the same time without sharing lifecycle state or storage.
3. **Single-run consistency.** A session runs one input at a time; sends while busy are rejected today (queueing is designed in, see below).
4. **Pi's shapes end to end.** The browser receives Pi's entries and documents unchanged; mapping them to rows is rendering, done in the browser.
5. **Responsive streaming.** Each engine commit reaches the browser as a delta of what changed, not a copy of the running turn.
6. **Predictable failure behavior.** Disconnecting a client, stopping a run, and rejecting a command have distinct outcomes.

## Non-goals

- client-owned or browser-local agent execution
- durable replay of every stream event to clients
- multi-client fencing beyond what versions and revisions provide

## Storage

Each Supernova session is one SQLite file, `<agentDir>/sessions-v2/<sessionId>/session.sqlite`, opened by one Harness. The session's chat starts as the file's root conversation; undo forks inside the same file (see [Checkpoint system](checkpoint-system.md)). One file per session follows Pi's own durable coding agent: a storage failure is fatal only to its own file, sessions never contend on one commit line, and idle sessions can close.

`<agentDir>/sessions-v2/index.json` maps session ids to their record (project, worktree, title, fork source, archive time). Lookup and project listing read only the index; no session file is opened to list. The engine cannot list by project, so the index is ours.

Under `bun run dev:server` the server runs on Bun, which has no `node:sqlite`; `pi/lib/session/sqlite-storage.ts` adapts `bun:sqlite` to the engine's SQLite facade. Electron and the packaged server run Node.

Sessions written by the old SDK (`<agentDir>/sessions/`) are read-only: `pi/lib/session/legacy-sessions.ts` lists and renders them; mutating commands reject. Conversion into the engine is a `TODO(legacy-convert)` there.

## Architecture

```mermaid
flowchart BT
    subgraph server[Server]
        rpc[Agent RPC]
        sessions["Sessions<br/>create, load, rename, fork"]
        runtimeService["SessionRuntime<br/>commands and global stream"]
        worker["SessionWorker per session<br/>session document, deltas"]
        store["SessionStore<br/>index + open session files"]
        file["SessionFile<br/>Harness on one file"]

        rpc --> sessions
        rpc --> runtimeService
        sessions --> runtimeService
        runtimeService --> worker
        worker --> store
        store --> file
    end

    subgraph browser[Browser]
        query["React Query<br/>Session document"]
        liveStore["Zustand<br/>status, pending message, optimistic navigation"]
        timeline["build-turns<br/>entries + pi.live → rows"]
    end

    rpc -->|getSession| query
    runtimeService -->|session.state deltas| query
    query --> timeline
```

`pi/session-store.ts` is the seam onto the engine; features never import `pi-durable`. Contracts import Pi's types (type-only) so the browser sees Pi's shapes; `PiJson` carries those values with a JSON check only.

| State                                  | Owner                                     | Lifetime        |
| -------------------------------------- | ----------------------------------------- | --------------- |
| Transcript, runs, tasks                | Engine session file                       | Durable         |
| Turn records, navigation               | `supernova.session` document in that file | Durable         |
| Session index                          | `index.json`                              | Durable         |
| Session document, version, revisions   | `SessionWorker`                           | Server process  |
| Mirrored session document              | React Query                               | Browser cache   |
| Pending message, optimistic navigation | Zustand session live store                | Browser process |

## The session document

`SessionStore.snapshot()` builds the `Session` from the visible conversation's current view: its history in append order (compacted entries included, system prompt entries left out), the leaf's entries past it as `undone`, `pi.agent`, `pi.live`, `pi.usage`, the turn records' authored content, `runStart`, and context usage. Entries are read only up to the view's newest one, so a final answer never appears beside the partial `pi.live` still streams. Entries are append-only, so a rebuild reads only entries after the last one it has while the visible conversation and leaf are unchanged.

`runStart` is the first user entry of the active run. Pi's `pi.live.run` lists the run's input submissions, not entries; the server resolves them so the browser knows where the turn being answered starts.

## Streaming

`SessionWorker` holds the last document it published. Every engine frame of the visible conversation, and every change no frame shows (a rename, navigation, a placed input's turn record), rebuilds it, diffs it against the previous one with Chord's `diffRevisions`, and publishes `session.state` with the ops and the new `version`. A frame only triggers a rebuild of the current state, so a frame handled late never moves the document backwards. `activity` (`idle`, `running`, `compacting`, from `pi.live`) rides along so the sidebar knows what sessions it has not loaded are doing.

The browser applies a delta with `applyImmutable` only to the version it was made from. A cached document further behind, or a placeholder, is refetched; stale and duplicate deltas are ignored. Versions start at the time the worker first built the document, so a document from before a server restart never takes a delta from after it.

Submitting runs inside the worker's publication queue: the engine places the user entry and the turn record is written in a second commit, and no document may be published between them, or the browser would show a user entry without its record.

## Running a turn

`sendMessage` selects and checks the model, prepares the prompt and images, configures the visible conversation's model, captures the before-turn checkpoint, and submits the input; a busy session rejects it. It resolves once the engine placed the input; the run continues under the engine. The title is generated alongside and published as `session.updated` and a delta.

When a frame shows no active run, the worker captures the after-turn checkpoint of every turn that lacks one: one capture serves all inputs a run answered, and runs that finished while nothing watched (after a restart) are caught up on first watch.

The browser shows the message it sent at once as a pending turn, until the session's state has a new turn record. It projects entries before `runStart` as settled turns and entries from it on, plus `pi.live` (streamed partial, running tool output, blocking compactions), as the live turn (`lib/timeline/turns/build-turns.ts`). A streaming partial's last tool call shows no arguments: they may be cut. The engine commits partials at most every 100 ms, so intermediate states may be coalesced.

### Queueing and steering

Not exposed yet. The engine supports it (`whenBusy: "steer" | "followUp"` on submit, the queue in `pi.inbox`, withdrawal), and busy state already comes from the engine's run state. Exposing it means a `whenBusy` field on `sendMessage`, `pi.inbox` in the session document, a withdraw call, and writing a queued input's turn record and before-turn checkpoint when the engine places it rather than at submit (`TODO(queue)` in `SessionFile.submit`).

### Settings

`pi/config/harness-settings.ts` maps Pi's file settings onto Harness settings read at every use: compaction, retry, stream timeouts, transport, queue modes. Thinking budgets and the websocket timeout, which the engine's stream options lack, are added to every request by the `Models` wrapper in the same file. Shell path, command prefix, and image resizing are applied by the tools. Background compaction is off (`TODO(pi-durable)` in `harness-settings.ts`): the old SDK never compacted in the background and the timeline has no design for it.

## Concurrency

Different sessions run independently. Within a session the engine runs one input at a time; navigation and manual compaction reject while a run is active or another command runs. Route changes in the browser never interrupt server work.

## Failure and recovery

- **Command rejection.** Failures while selecting the model, preparing, or admitting the input reject the command RPC. The browser drops its pending message.
- **Run failure.** A model error is an assistant error entry, shown in the turn. An input that ends unanswered for another reason publishes `session.error`.
- **User abort.** `abortSession` aborts the visible conversation's work; the run ends through the normal path and the document shows what was produced.
- **Browser disconnect.** Removes that subscriber only. On reconnect the browser refetches every cached session; deltas continue from the refetched version.
- **Server shutdown or crash.** Closing the server closes every session file without aborting work. On the next open the engine resumes the run from its last commit: an interrupted tool call that is not replay-safe gets an interrupted result, and the turn finishes. Turns that finished without an after-turn checkpoint get one when their session is next watched.
- **Extension reload.** Updating extensions reinstalls them on every open session in place; a running call finishes on the code it took.

## System invariants

1. The server's session document is the only source of session state; the browser changes it only by applying the server's deltas or replacing it with a read.
2. A delta applies only to the version it was made from.
3. A user entry and its turn record appear in the same version.
4. Every visible state was committed to the session file first.
5. One session runs one input at a time; sessions run concurrently.
6. Unsubscribing a client never aborts server-owned work; closing a session never aborts it either.
7. Stale or duplicate session events cannot move client state backwards.
