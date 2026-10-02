# Pi engine migration: parity checklist

**Status:** migrated. Engine boundary in `packages/agent-runtime/src/pi/` (`session-store.ts`, `session-file.ts`, `config/`, `lib/`), legacy reader in `pi/lib/session/legacy-sessions.ts`, `session-runtime`/`sessions`/`projects` on it. `bun run build`, `lint`, `typecheck`, `prettier`, and `test` (agent-runtime: 109 unit, 133 integration) pass. `test:e2e` only covers frontend timeline interactions and is not a behavior check for this migration. Temporary behavior checks (deleted after running) confirmed: a real extension file on disk (tool, `tool_call` block, `tool_result` rewrite, `session_start`, unsupported-event report) through the full runtime; a full runtime restart during a bash call recovering the turn; and all 24 real legacy sessions (544 turns) listing and rendering from a copy. Open items are listed at the end.

Working checklist for [the handoff](pi-engine-migration-handoff.md). Each row records how the capability works today, where it lives after the migration, and its status: **ported**, **replaced** (by an engine feature), **drop?** (proposed, needs agreement), or **open**. Delete this file when the migration is done.

Engine: `vendor/pi` at upstream `e792ba1` (see `vendor/pi/PROVENANCE.md`). `pi-coding-agent` is pinned to `0.99.2` (it must share the vendored `pi-ai`).

## Corrections to the handoff

Checked against the code, these assumptions in the handoff are wrong:

| Handoff says                                                         | Actual                                                                                                                                                                                                                                 | Consequence                                                                                                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grep`/`find`/`ls` were usable and must be ported                    | Active tools today are `read, bash, edit, write, web_fetch` (verified by building a session with today's factory). `grep`/`find`/`ls` are registered but never active, and `defaultTools` is not passed through `loadRuntimeSettings`. | Not exposed today, so not needed for parity. If we want them later, `pi-coding-agent` already **exports** `create{Grep,Find,Ls}ToolDefinition`, so no port. |
| Port `*ToolSystemPromptContribution` and `buildSystemPromptSections` | Neither is exported. The exported `create{Read,Bash,Edit,Write}ToolDefinition` carry `promptSnippet`/`promptGuidelines`.                                                                                                               | Port only `buildSystemPromptSections` (one file). Take snippets from the exported definitions; no per-tool copies.                                          |
| SQLite "shared-database mode" gives indexed listing                  | That mode belongs to `session-backends/sqlite-node`, which targets the old `pi-agent-core`. Durable SQLite is one Session per file, and `scanConversations` filters only by owner.                                                     | Listing needs our own index document (below).                                                                                                               |
| Steer, follow-up and queued input are parity items                   | Not in the contracts or the web client: `sendMessage` while busy throws `Session already has active work`.                                                                                                                             | Parity is "reject while busy" (`whenBusy: "reject"`). Queueing is a new feature (contracts + web). **drop?** from this migration.                           |
| `ctx.ui` calls must be ported                                        | Extensions are bound with `mode: "print"` and no UI context, so `ctx.hasUI === false` and every `ctx.ui.*` is Pi's no-op.                                                                                                              | Parity: `hasUI: false`. Calls to `ctx.ui.*` throw instead of silently no-oping (the handoff's fail-loudly rule).                                            |
| "Active-tool selection per session"                                  | No contract or UI selects tools.                                                                                                                                                                                                       | N/A                                                                                                                                                         |
| Initial model via `findInitialModel`                                 | The client sends `modelReference` with every message; the server only applies it. `Configuration` serves the defaults.                                                                                                                 | Not needed.                                                                                                                                                 |

## Decisions

Agreed with the maintainer. Policy: where the engine adds behaviour that would change the product (UI or semantics), configure it to match the old SDK and leave a short `TODO(pi-durable)` that explains the open choice.

1. **One SQLite file per session**, as Pi's durable coding agent does: `<agentDir>/sessions-v2/<sessionId>/session.sqlite`. The session's chat is the root conversation. Why: a storage failure is fatal only to its own file, sessions do not contend on one commit line, and idle sessions can close. Undo/redo forks live inside the session's file. A session fork is a new file seeded from the source's visible history (`forkedFrom` recorded).
2. **Session index** owned by us (`<agentDir>/sessions-v2/index.json`, one record per session: `projectPath`, `worktree?`, `title?`, `forkedFrom?`, `archivedAt?`, `createdAt`, `updatedAt`). Lookup by id is a map read, and listing a project filters in memory. No session file is opened to list. The contracts are unchanged.
3. **Busy sessions:** sends use `submit({whenBusy})`, fixed to `"reject"` until queueing ships. Busy state is the engine's `pi.live.run`, not our own lock. Queueing then needs contract and UI work (`whenBusy` on send, `pi.inbox` in live state, a withdraw call) plus writing a queued input's turn record and checkpoint when the engine places it (`TODO(queue)` in `SessionFile.submit`).
4. **Background compaction off** (`backgroundTokens: 0`) with a `TODO(pi-durable)`: the old SDK never compacted in the background, and showing a compaction that overlaps a streaming answer is an open UI decision.
5. **Engine `bash` wording accepted** (description and parameter text differ cosmetically from the old SDK).
6. **`grep`/`find`/`ls` dropped:** never active in Supernova, and not part of the engine. The timeline mapping for those tool kinds stays because the contracts define them and an extension may register same-named tools.
7. **Legacy sessions read-only:** `pi/lib/session/legacy-sessions.ts` reads old JSONL files with the old `SessionManager` (never writes) and maps them into the same entry records the timeline mapper uses. Mutating commands reject with a clear error; the contracts are unchanged (no `readOnly` flag for now). Conversion is left as `TODO(legacy-convert)`: committing those mapped records into a new session file.
8. **Bun dev mode:** `bun run dev:server` runs under Bun, which has no `node:sqlite`; a small `bun:sqlite` adapter implements the engine's `SqliteDatabase` facade. Node (Electron, packaged server) uses `openNodeSqliteStorage`.
9. **Committed/live split from one view.** `getSession` maps entries before the current run's first input. `session.turn` is built from the run's entries plus `pi.live`. This replaces synthetic branch entries, `ActiveTurn` and the frozen committed snapshot.
10. **Tools:** `CodingTools` with wrappers for `read` (images, via the exported `createReadToolDefinition`) and `bash` (`PI_*` env vars). `web_fetch` becomes a `defineTool`.
11. **Settings the engine cannot take** (`thinkingBudgets`, `websocketConnectTimeoutMs`) are added by a thin `Models` wrapper over `ModelRuntime`.

## Checklist

### Configuration and settings

| Capability                                                                   | Today                                    | After                                                                                                                        | Status                     |
| ---------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Settings source, global + project precedence, `projectTrusted` policy        | `pi/config/settings.ts` `loadPiSettings` | unchanged                                                                                                                    | ported                     |
| `compaction.{enabled,reserveTokens,keepRecentTokens}`                        | `loadRuntimeSettings` → SDK              | `HarnessSettings.compaction` getter. Engine adds `backgroundTokens` (default 32768); today there is no background compaction | open: keep engine default? |
| `retry.{enabled,maxRetries,baseDelayMs}`                                     | → SDK                                    | `HarnessSettings.retry`                                                                                                      | open                       |
| `retry.provider.{timeoutMs,maxRetries,maxRetryDelayMs}`, `httpIdleTimeoutMs` | → SDK                                    | `HarnessSettings.stream` (as Pi's reference)                                                                                 | open                       |
| `transport`                                                                  | → SDK                                    | `stream.transport`                                                                                                           | open                       |
| `thinkingBudgets`, `websocketConnectTimeoutMs`                               | → SDK                                    | `Models` wrapper (decision 7)                                                                                                | open                       |
| `shellPath`                                                                  | → bash tool                              | `NodeExecutionEnv({shellPath})`                                                                                              | open                       |
| `shellCommandPrefix`                                                         | → bash tool                              | `createBashTool({commandPrefix})`                                                                                            | open                       |
| `images.autoResize`                                                          | → read tool                              | read image wrapper (decision 6)                                                                                              | open                       |
| `enableInstallTelemetry`                                                     | → SDK                                    | package manager only, no engine role                                                                                         | N/A                        |
| Settings changes take effect next run                                        | SDK reloads per session open             | getters read `loadPiSettings` per use (cached per project, invalidated on update)                                            | open                       |
| HTTP dispatcher + proxy                                                      | implicit in SDK                          | port `core/http-dispatcher.ts` into `pi/`, called once in `createPiSdk` before any request; adds `undici@8.10.2`             | open                       |

### Models, providers, credentials

| Capability                                                  | Today                                   | After                                                                             | Status |
| ----------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| List/refresh models, context window, thinking-level mapping | `ModelRuntime` via `pi/lib/models`      | unchanged; `ModelRuntime` is passed to `Harness.open` as `models`                 | ported |
| Model + thinking level per send                             | `selectModel` → `AgentSession.setModel` | `conversation.configure({model, thinkingLevel})`                                  | open   |
| Unauthenticated provider fails before work                  | `setModel` checks auth                  | explicit `getProviderAuthStatus` check in `selectModel` (keeps the existing test) | open   |
| Login/logout, OAuth, auth sources                           | `features/providers` on `ModelRuntime`  | unchanged                                                                         | ported |

### System prompt

| Capability                                                 | Today                                            | After                                                                                                                                                                                                        | Status |
| ---------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Preamble, tools, rules, docs, project context, skills, cwd | SDK `buildSystemPrompt` from the resource loader | `pi/prompt` extension of sections: ported `buildSystemPromptSections`, snippets from exported tool definitions, context files and skills from our resource loader (keeps the `~/.agents/AGENTS.md` override) | open   |
| Rendered prompt identical                                  | —                                                | test diffs the engine's rendered system text against the old SDK's `session.systemPrompt` for one fixture project                                                                                            | open   |

### Tools

| Capability                                                                                                                                    | Today                        | After                                                                                                                                                                                                                                                                                                                                     | Status |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `read`, `write`, `edit`, `bash`                                                                                                               | SDK built-ins                | `CodingTools` with wrappers. `write`/`edit` are identical (description + schema diffed). `read` description differs (no images) and is restored by the image wrapper. `bash` differs: description "Returns combined stdout and stderr", parameter text "Bash command", and no `outputSchema`. Proposal: accept the engine text (cosmetic) | open   |
| `bash` exports `PI_SESSION_ID`, `PI_SESSION_FILE`, `PI_PROVIDER`, `PI_MODEL`, `PI_REASONING_LEVEL`, and the prompt tells the model about them | old bash tool                | `wrapTool(bash)` sets them from `api.agent()`; `PI_SESSION_FILE` is dropped (no file per session)                                                                                                                                                                                                                                         | open   |
| Bash/read truncation shown in the timeline                                                                                                    | `details.truncation`         | engine `diagnostics` + `droppedBytes`/`droppedLines`, mapped in the tool factory                                                                                                                                                                                                                                                          | open   |
| `web_fetch`                                                                                                                                   | `ToolDefinition`             | `defineTool`                                                                                                                                                                                                                                                                                                                              | open   |
| Timeline rendering per tool                                                                                                                   | `tool-invocation-factory.ts` | unchanged mapping; result input comes from `pi.tool-result` entries / `pi.live` slots                                                                                                                                                                                                                                                     | open   |
| `grep`/`find`/`ls`                                                                                                                            | registered, inactive         | not exposed (see corrections)                                                                                                                                                                                                                                                                                                             | drop?  |

### Skills, prompt templates, composer

| Capability                                               | Today                                               | After                                                           | Status |
| -------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------- | ------ |
| Skills discovery, prompt templates, composer suggestions | `pi/resource-cache.ts` over `DefaultResourceLoader` | unchanged (engine-independent)                                  | ported |
| Skill invocation / text attachments / images in prompt   | `prompt-builder.ts`, `send-message-context.ts`      | unchanged; content goes to `submit({content})`                  | open   |
| Authored content parts for display                       | `supernova.user-message-content-parts` custom entry | same kind as an app entry (`write` submission before the input) | open   |

### Extensions

| Capability                                                                                    | Today                                               | After                                                                     | Status |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| Discovery, module loading, load errors                                                        | `DefaultResourceLoader.getExtensions()`             | unchanged                                                                 | ported |
| `registerProvider` (used by the one installed package, `pi-provider-kiro`)                    | `ExtensionRunner` flushes onto `ModelRuntime`       | bridge flushes `runtime.pendingProviderRegistrations` onto `ModelRuntime` | open   |
| `registerTool`                                                                                | runner → active tools                               | bridge → engine tool (shape conversion)                                   | open   |
| Events `tool_call`/`tool_result`                                                              | runner                                              | `ToolTask` `beforeTool`/`afterTool` hooks                                 | open   |
| `context`, `before_provider_request`                                                          | runner                                              | `GenerationTask.beforeRequest`                                            | open   |
| `before_agent_start` (system prompt edit)                                                     | runner                                              | section                                                                   | open   |
| `session_start`, `session_shutdown`, `agent_start/end`, `turn_*`, `message_*`, `model_select` | runner                                              | emitted by the bridge from view transitions                               | open   |
| `ctx.ui.*`                                                                                    | no-op (`hasUI: false`)                              | `hasUI: false`; calls throw                                               | open   |
| `registerCommand`, `registerShortcut`, `registerFlag`, renderers                              | collected, never surfaced                           | collected, reported once as unsupported                                   | open   |
| Any other event                                                                               | runner                                              | bridge reports it as unsupported when an extension subscribes             | open   |
| Update + reload                                                                               | `DefaultPackageManager.update`, stale-worker reload | same update; `registry.install` replaces bridge extensions live           | open   |

### Sessions

| Capability                                              | Today                                   | After                                                                                        | Status |
| ------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| Create with client id, worktree, delete on failed setup | JSONL file + `supernova.worktree` entry | `createConversation` + `supernova.session` doc in one commit                                 | open   |
| Lookup by id                                            | filename scan of every project folder   | exact doc address                                                                            | open   |
| List per project, newest first                          | `SessionManager.list` parses every file | `supernova.project` doc                                                                      | open   |
| Rename                                                  | `appendSessionInfo`                     | doc field                                                                                    | open   |
| Archive                                                 | move file to `archive/`                 | `archived: true`, removed from project list; checkpoints deleted as today                    | open   |
| Fork from a turn                                        | `createBranchedSession` + fork marker   | `conversation.fork(turnEndEntry)` + new session doc with `forkedFrom`                        | open   |
| Title generation                                        | `completeSimple` alongside the turn     | unchanged, writes the doc field, publishes `session.updated`                                 | open   |
| Context usage                                           | `buildSessionContextUsage` over branch  | same algorithm over active entries (uses exported `calculateContextTokens`/`estimateTokens`) | open   |

### Running a turn

| Capability                                                   | Today                                                 | After                                                                          | Status   |
| ------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| Send text/images/attachments/mentions                        | `AgentSession.prompt`                                 | `submit({type: "input", content, whenBusy: "reject"})`                         | open     |
| Streaming text/thinking/tools with live output               | event subscription → `ActiveTurn` → synthetic entries | one `viewState()` subscription per worker → live turn from entries + `pi.live` | open     |
| Partial tool arguments hidden until complete                 | `stripPartialToolArguments`                           | same rule on `pi.live.generation.message`                                      | open     |
| Abort                                                        | `AgentSession.abort`                                  | `conversation.abort()`                                                         | open     |
| Server restart mid-turn                                      | turn lost, session readable                           | `harness.resume()` continues it, so the session is recoverable                 | replaced |
| Provider errors, retries, tool errors                        | assistant `errorMessage`, `session.error`             | same mapping from entries; `unanswered` settlement → `session.error`           | open     |
| `session.agent.started/ended`, `session.snapshot`, revisions | worker                                                | worker, from `pi.live.run` transitions                                         | open     |

### Compaction

| Capability                                             | Today                      | After                                           | Status   |
| ------------------------------------------------------ | -------------------------- | ----------------------------------------------- | -------- |
| Manual compaction                                      | `AgentSession.compact`     | `conversation.compact()` + `waitForTask`        | open     |
| Threshold and overflow compaction                      | SDK                        | engine (settings above)                         | replaced |
| Timeline representation, `session.compaction.*` events | synthetic compaction entry | `pi.compaction` entries + `pi.live.compactions` | open     |

### Checkpoints, worktrees, navigation

| Capability                                                        | Today                      | After                                                         | Status |
| ----------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------- | ------ |
| Capture before/after each turn, statuses captured/disabled/failed | custom entries             | `supernova.checkpoints` doc (decision 5)                      | open   |
| Undo/redo/revert, conflict/uncaptured/inherited errors            | branch + cursor entries    | forks + doc (decision 5)                                      | open   |
| Shadow repository, git restore                                    | `checkpoints/`             | unchanged                                                     | ported |
| Redo invalidated by a new message                                 | cursor entry               | the redo leaf is cleared in the doc                           | open   |
| Worktree association                                              | `supernova.worktree` entry | `supernova.session.worktree`; the agent `cwd` is the worktree | open   |
| Checkpoint regression tests (1,240 lines)                         | —                          | rewritten against the new runtime with the same scenarios     | open   |

### Legacy sessions

| Capability                                  | Today            | After                                                             | Status   |
| ------------------------------------------- | ---------------- | ----------------------------------------------------------------- | -------- |
| Old JSONL sessions listed, opened, rendered | `SessionManager` | `pi/lib/session/legacy-sessions.ts` read-only reader (decision 7) | open     |
| Mutations on old sessions                   | allowed          | rejected with an explicit error                                   | open     |
| Conversion into the new engine              | —                | `TODO(legacy-convert)`                                            | deferred |

## Open items

- **Manual desktop pass not done** (handoff "Done means"): new session, tools, abort, restart mid-turn, compaction, undo/redo/revert, worktree, title, model/thinking change, extension update.
- **Extension bridge coverage:** only `registerTool`, `registerProvider`, `tool_call`, `tool_result`, `context`, `session_start`, `session_shutdown` are delivered; everything else is reported once per session as a `session.error`. The installed `pi-provider-kiro` subscribes to `model_select`/`agent_end` and calls `ctx.ui.setStatus` behind `ctx.hasUI` (false), so its provider works and its usage badge is reported as unsupported.
- **Bash `PI_SESSION_FILE`** is no longer set (no per-session JSONL); `PI_SESSION_ID` is the Supernova session id.
- **Live turn coalescing:** the engine commits partials every 100 ms, so tool inputs that stream in the same window appear together.
- **Context usage while running** is reported as unknown in committed reads; the live stream carries it.
- **Legacy conversion** is `TODO(legacy-convert)` in `pi/lib/session/legacy-sessions.ts`.
- **Background compaction** off; `TODO(pi-durable)` in `pi/config/harness-settings.ts`.
