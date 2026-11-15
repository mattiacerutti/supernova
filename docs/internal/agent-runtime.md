# Agent runtime

Conventions for `packages/agent-runtime`. See [Coding standards](coding-standards.md) for shared TypeScript rules and [Web](web.md) for the client-side counterpart; the two packages follow the same feature-first shape.

## Boundaries

Chord creates and wires the backend: every feature is a facet that serves objects, and objects reach each other with `self.get` and `ctx.get` (Chord's design, `.context/pi/packages/chord/docs/design.md` §6, §7, §16). A class with state or a native resource stays a class, opened by exactly one object with `self.open`; the object's members forward to it. Nothing constructs feature classes by hand, and no facet receives instances.

```
src/
  index.ts        the package entry: startServerHost
  composition/    creates the hosts and the per-process natives, and lists every facet
  core/           what composition hands the hosts: start data and shared natives
  features/       product logic and each feature's Chord objects
  lib/            helpers without Pi knowledge; lib/chord/ for Chord helpers
  pi/             Pi adapters several features share: the SDK, resources, settings, models
```

A feature reaches another only through its `contract.ts`: the local objects it serves. ESLint enforces this, keeps features from importing composition, and keeps `pi/` and `lib/` from importing anything above them. Keep each operation in the feature that owns the user action, not in a composition-level workflow factory.

## Composition

- `server-host.ts` creates the server host, the per-process natives (the Pi SDK, the resource cache, the checkpoint store, the title generator) and the session hosts, then loads `core` and every feature facet. Closing it closes the session hosts, then the server host, which closes every object and so every class an object opened.
- `session-hosts.ts` keeps one Chord host per session: starts it on the first hold routed to it, stamps its worker principal and generation, and releases it. No idle eviction: accepted work belongs to the session, not to whoever holds it. It routes before the server host loads, as Chord requires.
- `core/` serves the start data (`RuntimeConfig`; on a session host also `SessionInfo` with the session's record) and contributes the shared natives to registries (`RuntimeNative`, `SessionHostsNative`). These are one per process because every host shares the model runtime and the checkpoint store's project locks hold only when shared. With one process per session they become per worker.

Shared serializable contracts belong in `@supernova/contracts`. UI and HTTP routing belong outside this package.

## Layout

Where a file goes:

- Used by several features, no Pi knowledge → `lib/`.
- Wraps or maps Pi for several features → `pi/`. Pi code one feature uses belongs to that feature (chat's engine code is `features/chat/durable/`).
- Used by one feature → that feature, even if it looks generic.
- Used by exactly one file → that file.
- Sequences an application operation, including rollback → the owning feature's `operations/`, one file per operation. Accept `(input, deps, ctx)`: `deps` holds the natives its object read, `ctx` reaches other features' objects. Write the steps directly, including Chord calls when needed. Handle wire results explicitly and release acquired references in `finally`; no workflow factory or execution wrapper.

There is no catch-all `shared/`. Establish ownership before adding a new shared stateful layer.

## Features

```
features/<name>/
  contract.ts   its local contracts and native registries
  facet.ts      every host.serve of the feature: its stores, its other local objects, its remote services
  natives/      the stateful classes its stores open, one per file, named for the thing
  <name>.ts     plain functions, when the feature's logic needs no class (`workspace.ts`, `folders.ts`)
  lib/          plain helpers, by topic in subfolders when they grow (`lib/checkpoints/`)
  operations/   multi-step work, one (input, deps, ctx) function per file
  tools/        Durable tools the feature contributes
```

Nothing else sits at a feature root.

**A native** is a stateful class: `Sessions`, `SessionStatus`, `Chat`, `FileCheckpointStore`, `Terminals`, `TerminalProcess`, `LoginSessions`, `Providers`, `Extensions`. Exactly one store opens each with `self.open` and closes it; nobody else calls `new` on it. A feature without state is plain functions (`Workspace`, `Folders`, `Configuration` are). The store passes the class what it needs from other objects, as `self.get` references or values from `core`. Methods take the contracts payload, return the contracts result, and throw the contracts error classes directly; no wrapping, no reclassification. Method names drop the feature noun: `sessions.create`, not `sessions.createSession`.

**`Deps`** is an interface naming what the class needs. Narrow the SDK with `Pick<PiSdk, "modelRuntime">` so tests construct the class with only the methods it calls. The tripwire: if a feature class's test has to construct another feature to run, the boundary is wrong. Operations intentionally span features and are tested over the real server host.

**State the rest of the app follows** is set by the class on the `self.writable` its store passes in (typed `Published<T>`), never through listeners on the class. Chord refuses a write once the object ended, so a class whose close still produces changes (`Terminals` ending its shells) stops publishing first.

Group a folder once it holds more than about five files, by what the files are for. Treat that as a readability guideline, not a reason to split one coherent concern arbitrarily.

**Naming.** Files are kebab-case. A class is named for what it is, not the layer it sits in: `Chat`, `Terminals`, `Sessions`, with no suffix. Files ending in `-utils`, `-helpers`, `-manager`, `-service` are a smell; the path should carry the domain.

Chord objects carry their kind in their name, so a class and its object never share one:

- A remote contract ends in `Service` (`SessionsService`, `ChatService`, `TerminalService`). It lives in `@supernova/contracts` and is served in the feature's `facet.ts`.
- A store ends in `Store` (`SessionCatalogStore`, `TerminalsStore`, `ChatStore`) and is named `supernova.store.<name>`: a local object with empty params, so it lives as long as its host, that holds shared state or opens a native. Nothing else is a store.
- A native registry ends in `Native` (`SessionsNative`, `ChatNative`) and is named `supernova.native.<name>`. Members are JSON, so the other objects on the host reach the class instance through it with `nativeOf(self, Registry)`. Reference the store that opens it first (`self.get`): that orders the reader's close before the native's.
- Any other local object has no suffix and is named for what it does (`SessionOperations`, `Worktrees`, `RuntimeConfig`, `SessionInfo`), as `supernova.<name>`. It exists when there is no other way in: a local object's calls act as the server (`SessionOperations`), or another feature calls it (`Worktrees`). Never wrap a native in an object only to forward its methods; read the native.
- A facet is a constant named for its feature (`workspaceFacet`). Only `core`'s facets take arguments.

## Errors

Throw declared contract errors when clients need to distinguish a failure; use ordinary errors otherwise. Chord carries a contract error to the client by its code, and anything else as `internal`. List a method's declared errors in its service's `Errors` next to the contract, so clients can read them. Wire representation and tag conventions live in [Contracts](contracts.md#errors).

Throw a contract error where the failure is detected, not by classifying causes later; a checkpoint conflict, for example, is thrown as `CheckpointConflictError` by the shadow repository. See [Checkpoint system](checkpoint-system.md).

## Streams

Anything clients follow over time is owned by a class (`SessionStatus`, `Terminals`, `LoginSessions`, the catalog) inside its store, so it outlives every client. The store passes the class a `self.writable` and exposes it with `self.derive` as a JSON state member; remote objects hand that member on or derive from it. The class sets the whole value; do not edit documents or queue writes. Chord diffs each new value against the last, so a grown string goes out as an append and a grown list as inserts, and a new hold starts from the current value. Do not add a parallel replication protocol.

A derive diffs, so it does not know a string lost its front: a trimmed terminal buffer goes out whole, once per 64 KiB of output (the slack between the cap and the trim). Keep values whose every change is large out of a derive.

Keep high-volume state separate from summaries. A client that needs the terminal list should not also receive every terminal's output, so `TerminalService` derives one terminal's output from the store's map; only that terminal's changes reach its holders. Replicated values must be strict JSON: no `undefined` fields. See [workspace/facet.ts](../../packages/agent-runtime/src/features/workspace/facet.ts) for the serving pattern.

### Serving a feature

A feature's `facet.ts` serves its stores and its remote services. Remote members use `method` and `action` from `lib/chord/methods`, which return `null` for a method without a value and log a failure with its cause before rethrowing it, and `forbidden` from `lib/chord/principals` to refuse other principals; keep them thin. State that must survive belongs in a store's class, not in a remote object or a closure.

Keep method bodies direct: assign the new view selection, then refresh it. Avoid higher-order wrappers around a mutation. Separate declarations, subscriptions, and method bindings with blank lines; expand handlers whose control flow would be hidden in a one-liner.

A session host acts with a `worker` principal naming its session and start generation; the server checks that generation against the session hosts before accepting reports.

Accepted session creation, forks and archives are server-owned: `SessionsService` calls `SessionOperations` without the caller's abort signal; a local object's calls act as the server, so the operations reach the session's chat as the server and a browser's cancellation never reaches them (as p2's `SessionOperations` does). Releasing a session (archive, failed create) suspends its route, closes its host, deletes its checkpoints and forgets its status (`operations/release-session.ts`); its route resolves again only when a hold arrives after the suspension, and the catalog then decides.

The built-in features are facets that ship and update with the app; nothing reloads or removes them while the server runs. Revisit that when a built-in feature must be switched on and off live; do not add plugin machinery in anticipation.

## `pi/`

`pi/` holds only what several features need from Pi: `sdk.ts`, `resource-cache.ts`, settings and resource loading (`config/`) and model mapping (`lib/models/`). Pi code that one feature uses lives in that feature: the chat's harness settings, system prompt, coding tools and extension bridge are `features/chat/durable/`, the old session import is `features/sessions/lib/legacy/`.

Two Pi packages, two roles: `@earendil-works/pi-durable` runs agents; `@earendil-works/pi-coding-agent` supplies model/auth support, settings, resources, and compatibility loading. Reuse them rather than implementing parallel engine behavior.

Code ported from Pi because it is not exported (the system prompt in `features/chat/durable/system-prompt.ts`, the HTTP setup in `pi/sdk.ts`) names its upstream file path; replace it with the import if Pi exports it.

Keep extension-source composition in `features/chat/durable/extensions/extensions.ts` and old SDK shapes inside its `legacy/`. `Chat` installs the result without knowing each compatibility source. This keeps migration work isolated instead of spreading legacy assumptions through features. User-visible support and limitations belong in [Pi compatibility](../pi-compatibility.md#extensions).

Inside `pi/` names drop the `Pi` prefix. Outside it, values that hold Pi types keep it (`PiModel`) so the reader knows which side of the boundary they are on.

## `features/sessions` and `features/chat`

A session is the container: its record (title, project, worktree, pin), its lifecycle (create, fork, archive) and its status. `sessions` owns it on the server host. The chat is the conversation inside a session: send, abort, compact, checkpoint navigation, and the `ChatDocument` the timeline renders. `chat` owns it on the session's own host. Keep each word to its own thing: what belongs to a session but not its chat (terminals, the worktree, the title) never goes through `chat`, and the chat's document is never called a session. See [Session runtime](session-runtime.md).

The chat has three natives, split by who writes:

- `SessionFile` owns the session's file: its Durable harness and our turn records beside Durable's entries. It is their only writer, and each public method is one whole action: `send` (captures the before-turn checkpoint, places the message and records its turn), `compact`, `stop`, `navigate` (undo, redo and revert: restores the workspace, then moves to a conversation that ends at the shown turns), `recordAfterTurnCheckpoints`, `forkSeed` and `seed`.
- `Transcript` reads what the timeline shows and writes nothing. It `follow`s the state with Durable's view of the current conversation from its newest turns and the drawer's first page of undone turns, reads the context usage at the conversation's end (`contextUsage`), and older pages from storage (`loadHistory`). `SessionFile` creates it with a read-only harness.
- `Chat` is the user's commands: each is one `SessionFile` action plus what lies outside the file (the busy guard, the title, message preparation, extensions, reports to the server).

Keep workspace recovery in `FileCheckpointStore` and `chat/lib/checkpoints/` (`SessionFile` calls it), and Supernova's tools in `chat/tools/`. Native engine tools do not go through the old-SDK bridge. Undo, redo, and revert must share the restore-then-show path; see [Checkpoint system](checkpoint-system.md).

## Testing

See [Testing](testing.md).

- Tests mirror `src` under `tests/unit` (pure functions only) and `tests/integration` (everything with a dependency). Fixtures live in `tests/support`, named for what they build.
- Cover runtime behavior, failure handling, stream and session lifecycle, persistence, emitted events, and cleanup.
