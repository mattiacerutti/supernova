# Agent runtime

Conventions for `packages/agent-runtime`. See [Coding standards](coding-standards.md) for shared TypeScript rules and [Web](web.md) for the client-side counterpart; the two packages follow the same feature-first shape.

## Boundaries

Logic lives in plain TypeScript classes; state that clients follow, and how long it lives, lives in Chord objects. Each feature's Chord side is its `facet.ts`: local objects that hold its documents and outlive every client, and remote objects that are thin client views over them (they check the principal, parse payloads, and hand documents to the client). Application operations may use Chord directly when coordinating a remote session; do not add a wrapper class merely to hide those calls.

```
src/
  index.ts        the package entry: createAgentRuntime, startServerHost
  composition/    constructs the runtime and owns host infrastructure
  features/       product logic and each feature's Chord objects
  lib/            helpers without Pi knowledge; lib/chord/ for Chord helpers
  pi/             Pi integration
```

Feature classes depend on `pi/`, `lib/`, and their own feature, not on other feature classes. Application operations are different: their job is to coordinate the runtime, so they accept `AgentRuntime` and call its existing objects directly. Do not replace those objects with a callback for every method. Facets may also receive the runtime to bind operations. Import its type only; composition constructs the runtime, not the feature.

Keep each operation in the feature that owns the user action, not in a composition-level workflow factory. `pi/` and `lib/` never import a feature or composition. ESLint enforces implementation import boundaries and rejects source files outside these four folders.

## Composition

- `runtime.ts` builds the feature classes, server host and session-host manager once. Operations use `runtime.host` and `runtime.sessionHosts` directly. Disposing the runtime closes hosts before storage.
- `server-host.ts` registers routes and loads feature facets on the runtime's server host. Each session host loads `session-runtime`'s facet instead.
- `session-hosts.ts` keeps one Chord host per session: starts it on the first hold routed to it, stamps its worker principal and generation, and releases it. No idle eviction: accepted work belongs to the session, not to whoever holds it.

Shared serializable contracts belong in `@supernova/contracts`. UI and HTTP routing belong outside this package.

## Layout

Where a file goes:

- Used by several features, no Pi knowledge → `lib/`.
- Wraps or maps Pi, regardless of how many features use it → `pi/`.
- Used by one feature → that feature, even if it looks generic.
- Used by exactly one file → that file.
- Sequences an application operation, including rollback → the owning feature's `operations/`, one file per operation. Accept the runtime and write the steps directly, including Chord calls when needed. Handle wire results explicitly and release acquired references in `finally`; no workflow factory or execution wrapper.

There is no catch-all `shared/`. Establish ownership before adding a new shared stateful layer.

## Features

```
features/<name>/
  <name>.ts     the feature class: one public method per service member
  facet.ts      its Chord objects: local stores and remote services
  lib/          pure helpers used by several methods
  operations/   plain functions for multi-step application operations
  <region>/     a stateful class with everything that serves it
```

Nothing else sits at a feature root.

**The feature class** is named for the feature (`Sessions`, `Workspace`) and constructed once in `runtime.ts`. Dependencies arrive through the constructor as one `Deps` object: `new Providers({loginSessions, sdk})`. Methods take the contracts payload, return the contracts result, and throw the contracts error classes directly; no wrapping, no reclassification. Method names drop the feature noun: `sessions.create`, not `sessions.createSession`. A feature with no dependencies has no constructor.

**`Deps`** is an interface naming what the class needs from `pi/`, `lib/`, and its own regions. Narrow the SDK with `Pick<PiSdk, "modelRuntime">` so tests construct the class with only the methods it calls. The tripwire: if a feature class's test has to construct another feature to run, the boundary is wrong. Application operations intentionally span features and are tested over the real runtime.

**A region** exists only when the feature owns a second stateful class. Helpers alone go in `lib/`, not a region. Inside a region:

- The class file(s) at the root, named for the thing (`session-worker.ts`, `login-sessions.ts`). A class that holds resources exposes `dispose()`.
- `commands/` for functions the class dispatches to.
- `lib/` for helpers that serve the region.
- When the region's surface is a value rather than a class, the file is named for what it exports (`tools/web-fetch.ts`).

Group a folder once it holds more than about five files, by what the files are for. Treat that as a readability guideline, not a reason to split one coherent concern arbitrarily.

**Naming.** Files are kebab-case. A class is named for what it is, not the layer it sits in: `SessionWorker`, `Terminals`, `Sessions`, with no suffix. Files ending in `-utils`, `-helpers`, `-manager`, `-service` are a smell; the path should carry the domain.

Chord objects carry their kind in their name, so a class and its object never share one:

- A remote contract ends in `Service` (`SessionsService`, `ChatService`, `TerminalService`). It lives in `@supernova/contracts` and is served in the feature's `facet.ts`.
- A local object exists only to own running work, and is named for that role: `SessionRuntime` owns the session's worker. Followed state is never a local object: a class owns it, and each remote object publishes it (below). Add a local object only to own work the same way.
- A facet function is named for its feature (`workspaceFacet`). Pass the objects it binds, or the runtime when it binds application operations; do not introduce an interface just to rename those dependencies.

## Errors

Throw declared contract errors when clients need to distinguish a failure; use ordinary errors otherwise. The remote edge converts failures to `ServiceResult` data. Keep its declared error handling aligned with the contract: types can catch an undeclared error being added but do not guarantee that none were omitted. Wire representation and tag conventions live in [Contracts](contracts.md#errors).

Throw a contract error where the failure is detected, not by classifying causes later; a checkpoint conflict, for example, is thrown as `CheckpointConflictError` by the shadow repository. See [Checkpoint system](checkpoint-system.md).

## Streams

Anything clients follow over time is owned by a class (`SessionStatus`, `Terminals`, `LoginSessions`, the catalog), so it outlives every client. A remote object publishes it with Chord's `self.writable` holding the class's current value and `self.derive` making it a JSON state member. Set the whole value from the class's change event; do not edit documents or queue writes. Chord diffs each new value against the last, so a grown string goes out as an append and a grown list as inserts, and a new hold starts from the current value. Do not add a parallel replication protocol.

A derive diffs, so it does not know a string lost its front: a trimmed terminal buffer goes out whole, once per 64 KiB of output (the slack between the cap and the trim). Keep values whose every change is large out of a derive.

Keep high-volume state separate from summaries. A client that needs the terminal list should not also receive every terminal's output, so each terminal's output is its own document. Replicated values must be strict JSON: no `undefined` fields. See [workspace/facet.ts](../../packages/agent-runtime/src/features/workspace/facet.ts) for the serving pattern.

### Serving a feature

A feature's `facet.ts` serves its remote services (and, on a session host, `SessionRuntime`). Remote members use `method` and `action` from `lib/chord/methods`, which parse the payload and turn throws into `ServiceResult` failures, and `forbidden` from `lib/chord/principals` to refuse other principals; keep them thin. State that must survive belongs in a class, not in a remote object or a closure.

Keep method bodies direct: assign the new view selection, then refresh it. Avoid higher-order wrappers around a mutation. Separate declarations, subscriptions, and method bindings with blank lines; expand handlers whose control flow would be hidden in a one-liner.

A session host acts with a `worker` principal naming its session and start generation; the server checks that generation against the runtime's session-host manager before accepting reports.

Accepted session creation is server-owned. The creation operation uses a server-owned context for both obtaining its chat reference and invoking methods; a background context on `get()` does not detach later calls from the browser's cancellation. It releases the reference in `finally`, without stopping accepted work.

The built-in features are facets that ship and update with the app; nothing reloads or removes them while the server runs. Revisit that when a built-in feature must be switched on and off live; do not add plugin machinery in anticipation.

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
