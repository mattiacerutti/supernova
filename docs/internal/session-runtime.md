# Session runtime

## Design and goals

Pi's durable engine owns execution and persisted session state. Supernova adds turn records, workspace checkpoints, project/session metadata, and product recovery policy. The browser receives the server's session document and builds the timeline; it does not maintain a competing execution model.

The active run is part of the durable engine view, not a separate uncommitted browser stream. Published engine output has already been committed, so reopening a session can recover interrupted work rather than treating it as lost.

Preserve these goals:

1. **Server-owned work:** acceptance must not tie execution to a request, route, or subscription.
2. **Independent sessions:** different sessions run concurrently without sharing lifecycle state or a storage commit line.
3. **Single-run consistency:** navigation and manual compaction cannot race a session's active work; busy sends are rejected.
4. **Pi's shapes end to end:** carry engine-owned state rather than inventing lookalike models; timeline rows are a client rendering concern.
5. **Responsive streaming:** propagate changes, not a growing copy of the whole transcript.
6. **Distinct failure outcomes:** rejection, run failure, user abort, disconnect, and shutdown are not interchangeable.

Client-owned execution, durable client replay of every stream event, and multi-client fencing are not goals of this design.

## Ownership and storage

Start with [SessionFile](../../packages/agent-runtime/src/pi/session-file.ts) for the engine boundary and [SessionWorker](../../packages/agent-runtime/src/features/session-runtime/worker/session-worker.ts) for product coordination.

| State                                 | Owner                           | Lifetime       |
| ------------------------------------- | ------------------------------- | -------------- |
| Transcript, runs, tasks               | Engine session file             | Durable        |
| Turn records and navigation           | Supernova document in that file | Durable        |
| Project/session metadata              | Session catalog                 | Durable        |
| Published document, activity, notices | Server runtime                  | Server process |
| Mirrored state and optimistic intent  | Client sessions store           | Client process |

Each session has its own SQLite file. This isolates storage failures and commit contention and allows idle sessions to close. The separate catalog exists because Pi cannot list sessions by project; lookup, listings, and search must not open every session file.

Page listings and searches on the server, using opaque cursors and deterministic ordering including ties. Do not load the whole catalog to filter or slice a page. The queries and migrations live in [session-catalog.ts](../../packages/agent-runtime/src/pi/lib/session/session-catalog.ts).

### Persistence changes

These stores are user data across releases. Migrate in place; never require deletion of session files to upgrade.

- Append catalog migrations rather than editing applied ones. Keep them transactional and restartable, and test that records built by earlier migrations survive.
- Version changes to the persisted Supernova document. Its migration must be pure and return a complete current value.
- Refuse unsupported newer formats rather than guessing; downgrades are not supported.

Legacy JSONL imports remain isolated in `pi/lib/session/legacy/`. Preserve original files and tolerate interrupted imports. The imported conversation is the branch the user last saw, not every abandoned or undone branch; model context must retain compaction meaning. Imported turns have no workspace snapshots, and unfinished tool calls need interrupted outcomes rather than invented success. Archived sessions remain archived. Read the importer for conversion details rather than reproducing its file traversal here.

## Observation and publication

The shared sessions service exposes lifecycle operations and directory summaries. Per-session runtime services expose documents and commands, bound to a session id. A route change must never redirect an already-issued command to another session.

Directory activity must be available without following every full transcript. A subscription observes feature-owned state; releasing it does not stop work. A later hold begins from the current document. Follow [Agent runtime](agent-runtime.md#streams) for state ownership and [Contracts](contracts.md#errors) for wire failures.

Chord owns snapshot/delta synchronization. Reconnect from a new authoritative snapshot rather than maintaining hand-written replay counters. A slow client can be disconnected and resynchronize; do not retain unbounded output for it or assume clients saw every intermediate transition.

Publication must preserve coherence:

- Build from the current engine view, so delayed notifications cannot move state backwards.
- Publish the user entry and authored turn metadata together. The engine places the input and Supernova records its turn separately; no intermediate revision should expose an entry without the metadata needed to interpret it.
- Make the accepted message visible before its optimistic placeholder disappears. A successful send response must not briefly erase the user's message.
- Never combine newer final transcript entries with older live partials. Partial tool arguments may be incomplete; do not present them as a finished invocation.

## History and presentation

The document combines shown and undone history, agent state at the navigation point, and live state. Authored content stays attached on both sides; durable workspace checkpoint records stay server-side.

Keep the replicated history bounded around the navigation point, preserving whole turns. Repeated undo/revert must not grow it without bound. Additional pages must still belong to the requested side of the current branch when they arrive; a stale page cannot merge into a different conversation after navigation. Retain previously loaded history only while it continues that branch. A single turn larger than the transport frame limit remains a limitation.

Reuse append-only history instead of rereading and rebuilding it on every stream update. The live-turn boundary must identify the user entry being answered, not merely the latest entry or input submission id. The projection and paging policy live in [session-snapshot.ts](../../packages/agent-runtime/src/pi/lib/session/session-snapshot.ts).

Keep server truth separate from pending client intent; apply optimism in one shared client projection. See [Web](web.md#state-management) for stores and UI integration.

## Admission, settlement, and engine capabilities

Sending resolves when the engine has placed the input, not when the run finishes. Work and any later failures belong to the session after that point. Settlement must catch runs completed while nothing watched them, including missing after-turn checkpoints after a restart. Do not depend only on observing a running-to-idle transition.

Queueing and steering are not exposed merely because the engine supports them. First define admission, withdrawal, and checkpoint semantics: a queued turn's before-checkpoint must describe the workspace when the engine places it, not when the user submitted it.

Similarly, background compaction needs a timeline design before enabling it. Keep settings adaptation at the Pi boundary rather than distributing provider-specific policy through features. Workspace coverage and navigation ordering live in [Checkpoint system](checkpoint-system.md).

## Failure and recovery

- **Command rejection:** preparation or admission failure rejects the command; remove its pending client intent without pretending work was accepted.
- **Run failure:** preserve produced output and surface the failure in the turn or a session notice. A returned send response does not mean later work succeeded.
- **User abort:** end the run through its normal settlement path, retaining what was produced.
- **Browser disconnect:** release that connection's holds only. Reestablish subscriptions and refresh stale query data on reconnect.
- **Server shutdown or crash:** close storage without converting work into user cancellation. On reopening, let the engine resume from committed state and decide replay safety; non-replay-safe tools must not be blindly rerun.
- **Archival:** deliberately stop work and release its resources before checkpoint cleanup. This is not equivalent to closing storage for shutdown.
- **Extension reload:** replace future behavior in place; running calls finish on the code they took.

Notices report problems that did not reject a command. Distinguish session work failures from extension compatibility warnings, and retain enough context to attribute them correctly. Starting another run must not erase a notice raised during startup; switching routes must not discard an unseen session failure. Client presentation belongs in the web guide, not in the engine lifecycle.
