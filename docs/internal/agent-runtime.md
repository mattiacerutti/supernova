# Agent runtime

Conventions for `packages/agent-runtime`. See [Coding standards](coding-standards.md) for shared TypeScript rules and [Web](web.md) for the client-side counterpart; the two packages follow the same feature-first shape.

## Boundaries

Logic lives in plain TypeScript classes; state that clients follow, and how long it lives, lives in Chord objects. Each feature's Chord side is its `facet.ts`: local objects that hold its documents and outlive every client, and remote objects that are thin client views over them (they check the principal, parse payloads, and hand documents to the client). Keep transport concerns there, not inside product operations.

```
src/
  index.ts        the package entry: createAgentRuntime, startServerHost
  composition/    the only code that knows every feature
  features/       product logic and each feature's Chord objects
  lib/            helpers without Pi knowledge; lib/chord/ for Chord helpers
  pi/             Pi integration
```

Dependencies flow one way: `lib/` ← `pi/` ← `features/` ← `composition/`. A feature never depends on another feature, by import or by injection: it does not import one, and its `Deps` does not name one or declare an interface another feature's class happens to satisfy. When a feature's object needs work that spans features (a session's archive closes terminals and removes a worktree), the feature declares the function it needs and `composition/` passes it in (`SessionWorkflows`). `pi/` and `lib/` never import a feature or composition. ESLint enforces the import half, and rejects source files outside these four folders; the injection half is on you.

## Composition

- `runtime.ts` builds every feature class once and wires their dependencies (`new Workspace({terminals})`). No Chord.
- `server-host.ts` starts the server's Chord host: it loads every feature's facet except `session-runtime`'s, routes session hosts, and hands status the reports no session can send (a host that stopped, Pi's warnings).
- `session-hosts.ts` keeps one Chord host per session: starts it on the first hold routed to it, stamps its worker principal and generation, and releases it. No idle eviction: accepted work belongs to the session, not to whoever holds it.
- `session-workflows.ts` holds product operations across features (create with a worktree and first message, fork, archive). They reach a session through `ChatService`'s server variant over the route, never its host's objects.

Shared serializable contracts belong in `@supernova/contracts`. UI and HTTP routing belong outside this package.

## Layout

Where a file goes:

- Used by several features, no Pi knowledge → `lib/`.
- Wraps or maps Pi, regardless of how many features use it → `pi/`.
- Used by one feature → that feature, even if it looks generic.
- Used by exactly one file → that file.
- Orchestrates several features (archive a session across `session-runtime`, `workspace` and `worktrees`, create a session and send its first message) → `composition/session-workflows.ts`.

There is no catch-all `shared/`. Establish ownership before adding a new shared stateful layer.

## Features

```
features/<name>/
  <name>.ts     the feature class: one public method per service member
  facet.ts      its Chord objects: local stores and remote services
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

**Naming.** Files are kebab-case. A class is named for what it is, not the layer it sits in: `SessionWorker`, `Terminals`, `Sessions`, with no suffix. Files ending in `-utils`, `-helpers`, `-manager`, `-service` are a smell; the path should carry the domain.

Chord objects carry their kind in their name, so a class and its object never share one:

- A remote contract ends in `Service` (`SessionsService`, `ChatService`, `TerminalService`). It lives in `@supernova/contracts` and is served in the feature's `facet.ts`.
- A local object exists only to own running work, and is named for that role: `SessionRuntime` owns the session's worker. Followed state is never a local object: a class owns it, and each remote object publishes it (below). Add a local object only to own work the same way.
- A facet function is named for its feature (`workspaceFacet`); a facet's dependencies are `<Feature>FacetDeps`.

## Errors

Throw declared contract errors when clients need to distinguish a failure; use ordinary errors otherwise. The remote edge converts failures to `ServiceResult` data. Keep its declared error handling aligned with the contract: types can catch an undeclared error being added but do not guarantee that none were omitted. Wire representation and tag conventions live in [Contracts](contracts.md#errors).

Throw a contract error where the failure is detected, not by classifying causes later; a checkpoint conflict, for example, is thrown as `CheckpointConflictError` by the shadow repository. See [Checkpoint system](checkpoint-system.md).

## Streams

Anything clients follow over time is owned by a class (`SessionStatus`, `Terminals`, `LoginSessions`, the catalog), so it outlives every client. A remote object publishes it with `published` from `lib/chord/state`: Chord's `self.writable` holding the class's current value, and `self.derive` making it a JSON state member. Set the whole value from the class's change event; do not edit documents or queue writes. Chord diffs each new value against the last, so a grown string goes out as an append and a grown list as inserts, and a new hold starts from the current value. Do not add a parallel replication protocol.

A derive diffs, so it does not know a string lost its front: a trimmed terminal buffer goes out whole, once per 64 KiB of output (the slack between the cap and the trim). Keep values whose every change is large out of a derive.

Keep high-volume state separate from summaries. A client that needs the terminal list should not also receive every terminal's output, so each terminal's output is its own document. Replicated values must be strict JSON: no `undefined` fields. See [workspace/facet.ts](../../packages/agent-runtime/src/features/workspace/facet.ts) for the serving pattern.

### Serving a feature

A feature's `facet.ts` serves its remote services (and, on a session host, `SessionRuntime`). Remote members use `method` and `action` from `lib/chord/methods`, which parse the payload and turn throws into `ServiceResult` failures, `forbidden` from `lib/chord/principals` to refuse other principals, and `published` for state; keep them thin. State that must survive belongs in a class, not in a remote object or a closure.

A session host acts with a `worker` principal naming its session and start generation; the server drops what an older generation sends (`isCurrent`, passed in by composition).

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
