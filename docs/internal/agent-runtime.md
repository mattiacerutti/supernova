# Agent runtime

Conventions for `packages/agent-runtime`. See [Coding standards](coding-standards.md) for shared TypeScript rules and [Web](web.md) for the client-side counterpart; the two packages follow the same feature-first shape.

## Boundaries

The package is plain TypeScript. Effect exists in `rpc/` only, because the wire protocol and contract schemas are Effect. Do not import `effect` anywhere else; `effect/Schema` is allowed for validating against contracts.

Dependencies flow one way: `lib/` ← `pi/` ← `features/` ← `runtime.ts` ← `rpc/`. A feature never depends on another feature, by import or by injection: it does not import one, and its `Deps` does not name one or declare an interface another feature's class happens to satisfy. `pi/` and `lib/` never import a feature. ESLint enforces the import half; the injection half is on you.

Shared serializable contracts belong in `@supernova/contracts`. UI and HTTP routing belong outside this package.

## Layout

```
src/
  index.ts        public exports: createAgentRuntime, agentRpcLayer
  runtime.ts      composition root: constructs every class once and owns dispose()
  rpc/            agent-rpc.ts maps each procedure to a feature function; edge.ts adapts thrown errors
  lib/            stateless helpers with no Pi or product knowledge
  pi/             the Pi SDK wrapper
  features/       configuration, folders, projects, providers, session-runtime, sessions, workspace
```

Where a file goes:

- Used by several features, no Pi knowledge → `lib/`.
- Wraps or maps Pi, regardless of how many features use it → `pi/`.
- Used by one feature → that feature, even if it looks generic.
- Used by exactly one file → that file.
- Orchestrates several features (archive a session across `session-runtime` and `projects`, create a session and send its first message) → `rpc/agent-rpc.ts`. It is the only file that sees every feature. If the sequence is not a transport concern but a product rule, the two features are one feature; merge them rather than wiring one into the other.

There is no `shared/`. A stateful class two features need is either Pi (`pi/`) or has no product owner; the second case has not occurred, so there is no folder for it.

## Features

```
features/<name>/
  <name>.ts     the feature class: one public method per RPC procedure
  lib/          pure helpers used by several methods
  <region>/     a stateful class with everything that serves it
```

Nothing else sits at a feature root.

**The feature class** is named for the feature (`Sessions`, `Workspace`) and constructed once in `runtime.ts`. Dependencies arrive through the constructor as one `Deps` object: `new Providers({loginSessions, sdk})`. Methods take the contracts payload, return the contracts result, and throw the contracts error classes directly; no wrapping, no reclassification. Method names drop the feature noun: `sessions.create`, not `sessions.createSession`. A feature with no dependencies has no constructor.

**`Deps`** is an interface naming what the class needs from `pi/`, `lib/`, and its own regions. Narrow the SDK with `Pick<PiSdk, "modelRuntime">` so tests construct the class with only the methods it calls. The tripwire: if a feature's test has to construct another feature to run, the boundary is wrong.

**A region** exists only when the feature owns a second stateful class. Helpers alone go in `lib/`, not a region. Inside a region:

- The class file(s) at the root, named for the thing (`session-pool.ts`, `login-sessions.ts`). A class that holds resources exposes `dispose()`.
- `commands/` for functions the class dispatches to.
- `lib/` for helpers that serve the region.
- When the region's surface is a function rather than a class, the file takes the region's name (`tools/tools.ts`).

Group a folder once it holds more than about five files, by what the files are for. `session-runtime/worker/commands/` holds six because a session can do six things.

**Naming.** Files are kebab-case. A class is named for what it is, not the layer it sits in: `SessionWorker`, not `SessionRuntime` (the feature class has that name). Files ending in `-utils`, `-helpers`, `-manager`, `-service` are a smell; the path should carry the domain.

## Errors

Throw the tagged error classes from `@supernova/contracts`. They are the wire format; nothing else is needed inside a feature. `rpc/edge.ts` passes declared errors through and turns anything undeclared into the procedure's generic error with the cause attached. Use `lib/errors.ts` `errorMessage(cause, fallback)` to build messages from unknown causes.

Checkpoint navigation is the one place errors are classified below the edge: `features/session-runtime/checkpoints/lib/checkpoint-error.ts` turns a workspace conflict into `CheckpointConflictError` so the client can offer a forced retry. See [Checkpoint system](checkpoint-system.md).

## Streams

Long-lived output is an `AsyncGenerator` built on `lib/event-bus.ts`. Subscribing registers immediately, so subscribe before triggering the work you want to observe. Consumers must `return()` or exit their `for await` to unsubscribe. The RPC edge converts with `Stream.fromAsyncIterable`.

## `pi/`

```
pi/
  sdk.ts              PiSdk interface and createPiSdk(); the one seam onto @earendil-works/pi-coding-agent
  resource-cache.ts   per-project memo of loaded extensions, prompts, and skills
  config/             resource-loader and settings policy
  lib/                every Pi ↔ contracts mapping and behavior Pi lacks: turns, content parts, models, session snapshots
```

Reach Pi through `Pick<PiSdk, …>`. An object over part of the SDK earns a file only when it holds state or behavior Pi lacks: `resource-cache.ts` does; `openSessionById` is a `lib/` function; a rename of `modelRuntime.getModel` is nothing.

Inside `pi/` names drop the `Pi` prefix. Outside it, values that hold Pi types keep it (`PiModel`, `PiSessionManager`, `buildPiTurns`) so the reader knows which side of the boundary they are on.

## `features/session-runtime`

Live execution: send, abort, compact, checkpoint navigation, the event stream. `sessions` is the durable record: create, load, rename. They are separate features because the Pi harness migration replaces this one and barely touches that one (see [Pi harness v2 migration](../pi-harness-v2-migration.md)). Do not reshape `worker/` internals ahead of the migration.

- `worker/session-pool.ts` keeps one `SessionWorker` per active session.
- `worker/session-worker.ts` owns the Pi `AgentSession` subscription, revisions, and the live turn.
- `worker/commands/` are what the pool dispatches to a worker.
- `checkpoints/` is the store, shadow repositories, and git plumbing; it moves as one unit under the migration.
- `tools/` are the Pi custom tools registered on every agent session.

## Testing

See [Development](development.md#verification) for verification and the test workflow.

- Tests mirror `src` file for file under `tests/unit` and `tests/integration` (`src/pi/lib/turns/build-turns.ts` → `tests/unit/pi/lib/turns/build-turns.test.ts`). Fixtures live in `tests/support`, named for what they build.
- Construct the feature class with `Deps` built from Pi's in-memory pieces (`SessionManager.inMemory()`, `registerFauxProvider`) or a temp directory. `tests/support/session-runtime.ts` builds `SessionRuntime` and `Sessions` this way.
- Assert with `await expect(feature.method(input)).rejects.toMatchObject({_tag: "…"})`. No Effect in tests below `rpc/`.
- Cover runtime behavior, failure handling, stream and session lifecycle, persistence, emitted events, and cleanup. Prefer real in-memory dependencies over mocks.
