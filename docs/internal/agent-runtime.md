# Agent runtime

Conventions for `packages/agent-runtime`. See [Coding standards](coding-standards.md) for shared TypeScript rules and [Web](web.md) for the client-side counterpart; the two packages follow the same feature-first shape.

## Boundaries

The package is plain TypeScript. Chord (`@earendil-works/chord`) is used where state is published to clients (`lib/document-state.ts`, the session board, terminal output, provider logins); `@earendil-works/pi-server` appears only in `rpc/runtime-services.ts`. Contract schemas are Zod; features may parse with them.

Dependencies flow one way: `lib/` ← `pi/` ← `features/` ← `runtime.ts` ← `rpc/`. A feature never depends on another feature, by import or by injection: it does not import one, and its `Deps` does not name one or declare an interface another feature's class happens to satisfy. `pi/` and `lib/` never import a feature. ESLint enforces the import half; the injection half is on you.

Shared serializable contracts belong in `@supernova/contracts`. UI and HTTP routing belong outside this package.

## Layout

```
src/
  index.ts        public exports: createAgentRuntime, runtimeServiceHost
  runtime.ts      composition root: constructs every class once and owns dispose()
  rpc/            the edge: runtime-services.ts serves every feature as Chord services; session-workflows.ts
                  orchestrates create and archive
  lib/            stateless helpers with no Pi or product knowledge
  pi/             the Pi wrapper: the durable engine and Pi's file formats
  features/       configuration, extensions, folders, projects, providers, session-runtime, sessions, workspace, worktrees
```

Where a file goes:

- Used by several features, no Pi knowledge → `lib/`.
- Wraps or maps Pi, regardless of how many features use it → `pi/`.
- Used by one feature → that feature, even if it looks generic.
- Used by exactly one file → that file.
- Orchestrates several features (archive a session across `session-runtime` and `projects`, create a session and send its first message) → `rpc/session-workflows.ts`. `rpc/` is the only layer that sees every feature. If the sequence is not a transport concern but a product rule, the two features are one feature; merge them rather than wiring one into the other.

There is no `shared/`. A stateful class two features need is either Pi (`pi/`) or has no product owner; the second case has not occurred, so there is no folder for it.

## Features

```
features/<name>/
  <name>.ts     the feature class: one public method per service member
  lib/          pure helpers used by several methods
  <region>/     a stateful class with everything that serves it
```

Nothing else sits at a feature root.

**The feature class** is named for the feature (`Sessions`, `Workspace`) and constructed once in `runtime.ts`. Dependencies arrive through the constructor as one `Deps` object: `new Providers({loginSessions, sdk})`. Methods take the contracts payload, return the contracts result, and throw the contracts error classes directly; no wrapping, no reclassification. Method names drop the feature noun: `sessions.create`, not `sessions.createSession`. A feature with no dependencies has no constructor.

**`Deps`** is an interface naming what the class needs from `pi/`, `lib/`, and its own regions. Narrow the SDK with `Pick<PiSdk, "modelRuntime">` so tests construct the class with only the methods it calls. The tripwire: if a feature's test has to construct another feature to run, the boundary is wrong.

**A region** exists only when the feature owns a second stateful class. Helpers alone go in `lib/`, not a region. Inside a region:

- The class file(s) at the root, named for the thing (`session-worker.ts`, `login-sessions.ts`). A class that holds resources exposes `dispose()`.
- `commands/` for functions the class dispatches to.
- `lib/` for helpers that serve the region.
- When the region's surface is a function rather than a class, the file takes the region's name (`tools/tools.ts`).

Group a folder once it holds more than about five files, by what the files are for. `session-runtime/worker/commands/` holds six because a session can do six things.

**Naming.** Files are kebab-case. A class is named for what it is, not the layer it sits in: `SessionWorker`, not `SessionRuntime` (the feature class has that name). Files ending in `-utils`, `-helpers`, `-manager`, `-service` are a smell; the path should carry the domain.

## Errors

Throw the tagged error classes from `@supernova/contracts`; nothing else is needed inside a feature. Pi's service protocol carries only its own error codes, so the edge returns failures as data: a `ServiceResult` whose `code` is the contract error's tag. `run()` in `rpc/runtime-services.ts` parses the payload, passes declared errors through, and turns anything undeclared into the operation's first declared error with the cause's message. Use `lib/errors.ts` `errorMessage(cause, fallback)` to build messages from unknown causes.

Checkpoint navigation is the one place errors are classified below the edge: `features/session-runtime/checkpoints/lib/checkpoint-error.ts` turns a workspace conflict into `CheckpointConflictError` so the client can offer a forced retry. See [Checkpoint system](checkpoint-system.md).

## Streams

Anything clients follow over time is Chord replicated state, served as a service's state member: `lib/document-state.ts` publishes whole documents (a session's) as diffed revisions; `SessionBoard`, terminal output (`Terminals.state`, appended per chunk and capped from the front), and provider logins (`LoginSessions.logins`) are mutable replicated state changed in place. Subscribers receive the current value at once and every later revision. Values must be strict JSON: no `undefined` fields.

`lib/event-bus.ts` remains for in-process fan-out.

## `pi/`

```
pi/
  sdk.ts              PiSdk interface and createPiSdk(); the seam onto @earendil-works/pi-coding-agent, and Pi's HTTP setup
  resource-cache.ts   per-project memo of loaded extensions, prompts, skills, and context files
  session-store.ts    SessionStore: every session's index record and open file; the seam onto @earendil-works/pi-durable
  session-file.ts     SessionFile: one session's engine instance (Harness) and its operations
  config/             resource-loader, settings policy, engine settings, and the system prompt
  lib/                every Pi ↔ contracts mapping and behavior Pi lacks: turns, content parts, models, sessions, tools
```

Reach Pi through `Pick<PiSdk, …>` or `Pick<SessionStore, …>`; only `pi/` imports `@earendil-works/pi-durable`. An object over part of Pi earns a root file only when it holds state or behavior Pi lacks: `resource-cache.ts`, `session-store.ts`, and `session-file.ts` do; `turnPositions` is a `lib/` function.

Two Pi packages, two roles. `@earendil-works/pi-durable` (vendored from source, see `vendor/pi/PROVENANCE.md`) runs agents. `@earendil-works/pi-coding-agent` is used only for what reads files and returns plain data: `ModelRuntime`, `SettingsManager`, skills, context files, prompt templates, extension loading, package management, and tool definitions for their prompt text. Its `SessionManager` is used only by `lib/session/legacy-sessions.ts` to read old sessions.

Code ported from Pi because it is not exported (the system prompt in `config/system-prompt.ts`, the HTTP setup in `sdk.ts`) names its upstream path and commit; replace it with the import if Pi exports it.

`lib/tools/extension-bridge.ts` turns loaded extensions into engine extensions: registered tools become engine tools, `tool_call`/`tool_result`/`context` handlers become engine hooks, and `session_start`/`session_shutdown` are delivered on open and close. Other events, commands, shortcuts, flags, and renderers are reported as unsupported, and `ctx.ui` or unknown context members throw on access, so nothing silently no-ops.

Inside `pi/` names drop the `Pi` prefix. Outside it, values that hold Pi types keep it (`PiModel`) so the reader knows which side of the boundary they are on.

## `features/session-runtime`

Live execution: send, abort, compact, checkpoint navigation, and each session's state. `sessions` is the durable record: create, load, rename, fork. See [Session runtime](session-runtime.md).

- `worker/session-worker.ts` watches the session's visible conversation, publishes its document as replicated state, and captures after-turn checkpoints.
- `worker/session-board.ts` is every open session's activity, summary, setup step, and last problem, for clients that have not attached the session.
- `session-runtime.ts` keeps one `SessionWorker` per session in use and dispatches to it.
- `worker/commands/` are what the feature class dispatches to a worker; `worker/lib/navigate-to-turn.ts` is the one restore-then-show path undo, redo, and revert share.
- `checkpoints/` is the store, shadow repositories, and git plumbing.
- `tools/` are Supernova's own tools offered in every session (`web_fetch`).

## Testing

See [Development](development.md#verification) for verification and the test workflow.

- Tests mirror `src` file for file under `tests/unit` and `tests/integration` (`src/pi/lib/models/map-model.ts` → `tests/unit/pi/lib/models/map-model.test.ts`). Fixtures live in `tests/support`, named for what they build.
- Construct the feature class with `Deps` built from real pieces: `tests/support/session-runtime.ts` builds `SessionRuntime`, `Sessions`, and `Projects` over a real engine with session files in a temp directory, Pi's `ModelRuntime` with `registerFauxProvider`, and in-memory settings. Seed history by running turns against the faux model, not by writing entries.
- Assert with `await expect(feature.method(input)).rejects.toMatchObject({_tag: "…"})`.
- Observe session state with `observe()` from `tests/support/session-runtime.ts`: the values a subscriber of the transcript and board received. `tests/support/runtime-server.ts` runs the real service protocol (`pi-server` and `pi-client`) over in-memory bytes for edge tests.
- Cover runtime behavior, failure handling, stream and session lifecycle, persistence, emitted events, and cleanup. Prefer real in-memory dependencies over mocks.
