# Agent runtime

Conventions for `packages/agent-runtime`. See [Coding standards](coding-standards.md) for shared TypeScript rules and [Web](web.md) for the client-side counterpart; the two packages follow the same feature-first shape.

## Boundaries

Features are plain TypeScript. Chord is the remote boundary; `runtime-services.ts` validates inputs and serves feature methods and state. Keep transport concerns there, not inside product operations.

Dependencies flow one way: `lib/` ← `pi/` ← `features/` ← root composition (`runtime.ts`, `runtime-services.ts`, `session-operations.ts`). A feature never depends on another feature, by import or by injection: it does not import one, and its `Deps` does not name one or declare an interface another feature's class happens to satisfy. `pi/` and `lib/` never import a feature. ESLint enforces the import half; the injection half is on you.

Shared serializable contracts belong in `@supernova/contracts`. UI and HTTP routing belong outside this package.

## Layout

Where a file goes:

- Used by several features, no Pi knowledge → `lib/`.
- Wraps or maps Pi, regardless of how many features use it → `pi/`.
- Used by one feature → that feature, even if it looks generic.
- Used by exactly one file → that file.
- Orchestrates several features (archive a session across `session-runtime` and `projects`, create a session and send its first message) → `session-operations.ts`. These are product operations, independent of transport. Root composition files may coordinate features; features never depend on each other.

There is no catch-all `shared/`. Establish ownership before adding a new shared stateful layer.

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
- When the region's surface is a value rather than a class, the file is named for what it exports (`tools/web-fetch.ts`).

Group a folder once it holds more than about five files, by what the files are for. Treat that as a readability guideline, not a reason to split one coherent concern arbitrarily.

**Naming.** Files are kebab-case. A class is named for what it is, not the layer it sits in: `SessionWorker`, not `SessionRuntime` (the feature class has that name). Files ending in `-utils`, `-helpers`, `-manager`, `-service` are a smell; the path should carry the domain.

## Errors

Throw declared contract errors when clients need to distinguish a failure; use ordinary errors otherwise. The remote edge converts failures to `ServiceResult` data. Keep its declared error handling aligned with the contract: types can catch an undeclared error being added but do not guarantee that none were omitted. Wire representation and tag conventions live in [Contracts](contracts.md#errors).

Throw a contract error where the failure is detected, not by classifying causes later; a checkpoint conflict, for example, is thrown as `CheckpointConflictError` by the shadow repository. See [Checkpoint system](checkpoint-system.md).

## Streams

Anything clients follow over time is owned by its feature, so it outlives every client. A remote service mirrors that state rather than owning it: a service object exists only while a client holds it, and a new hold starts from the feature's current value. Chord handles the initial snapshot and subsequent deltas; do not add a parallel replication protocol.

Keep high-volume state separate from summaries. A client that needs the terminal list should not also receive every terminal's output. Replicated values must be strict JSON: no `undefined` fields. See [runtime-services.ts](../../packages/agent-runtime/src/runtime-services.ts) for the serving pattern.

### Serving a feature

Service factories declare methods, state mirroring, and resources; keep them thin. State that must survive belongs in a feature, not a connection-scoped cell or closure.

The built-in services are not Chord facets: they ship and update with the app, and nothing reloads or removes them while the server runs. Revisit that when a built-in feature must be switched on and off live; do not add plugin machinery in anticipation.

## `pi/`

Reach Pi through `Pick<PiSdk, …>` or `Pick<SessionStore, …>`; only `pi/` imports `@earendil-works/pi-durable`. An object over part of Pi earns a root file only when it holds state or behavior Pi lacks: `resource-cache.ts`, `session-store.ts`, and `session-file.ts` do; `turnPositions` is a `lib/` function.

Two Pi packages, two roles: `@earendil-works/pi-durable` runs agents; `@earendil-works/pi-coding-agent` supplies model/auth support, settings, resources, and compatibility loading. Reuse them rather than implementing parallel engine behavior.

Code ported from Pi because it is not exported (the system prompt in `config/system-prompt.ts`, the HTTP setup in `sdk.ts`) names its upstream file path; replace it with the import if Pi exports it.

Keep extension-source composition in `extensions/extensions.ts` and old SDK shapes inside `extensions/legacy/`. The session store installs the result without knowing each compatibility source. This keeps migration work isolated instead of spreading legacy assumptions through features. User-visible support and limitations belong in [Pi compatibility](../pi-compatibility.md#extensions).

Inside `pi/` names drop the `Pi` prefix. Outside it, values that hold Pi types keep it (`PiModel`) so the reader knows which side of the boundary they are on.

## `features/session-runtime`

Live execution: send, abort, compact, checkpoint navigation, and each session's state. `sessions` is the durable record: create, load, rename, fork. See [Session runtime](session-runtime.md).

Keep per-session coordination in the worker, workspace recovery in `checkpoints/`, and Supernova's tools in `tools/`. Native engine tools do not go through the old-SDK bridge. Undo, redo, and revert must share the restore-then-show path; see [Checkpoint system](checkpoint-system.md).

## Testing

See [Testing](testing.md).

- Tests mirror `src` under `tests/unit` (pure functions only) and `tests/integration` (everything with a dependency). Fixtures live in `tests/support`, named for what they build.
- Cover runtime behavior, failure handling, stream and session lifecycle, persistence, emitted events, and cleanup.
