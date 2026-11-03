# Chord v2 and durable plugins: migration plan

Status: draft for review. Sources are the Pi monorepo cloned at `.context/pi` (main, `a57438e`, 2026-11-03) and the published npm packages. The repository's `.gitignore` already excludes `.context`.

## What I found

### Releases

- Supernova pins every Pi package at **1.2.0**. The latest release is **1.5.0** (2026-11-02).
- In the published `@earendil-works/chord@1.5.0`, the root export is still **Chord v1**. Chord v2 ships under the experimental subpath `@earendil-works/chord/next`. That subpath has the kernel (contracts, hosts, links, documents, registries, `self.follow`, `self.writable`) but no Node components.
- On Pi's `main` (unreleased), v2 is the root and Chord v1 is deleted (`ed4f488`). The Node components are exports: `/http`, `/workers`, `/plugins`, `/plugins/runtime`, `/app`, `/surfaces`, `/web`, `/react`, `/tui`. The plugin loader is unreleased and only on `main`.
- `pi-durable@1.5.0` depends on `chord@1.5.0` exactly, and its `StoreStorage` already imports `chord/next`.

### Consequence: the Pi upgrade and the Chord v2 port are one step

There is no cheap intermediate step.

- **Staying on v1 still means a rewrite.** Chord 1.3.0 removed the v1 APIs we use: `cell()`, `listener()`, `resource()`, `self.resources`, `self.listen`, `MembersOf` and `GetOptions.at`, and `connect` now requires a principal. Staying on v1 at 1.5.0 would mean rewriting `runtime-services.ts` once for v1.3 and again for v2.
- **Two Chord copies don't work.** Durable 1.5 requires a `Context` with `telemetry` (since 1.4), which `BACKGROUND_CONTEXT` from chord 1.2.0 doesn't have. Durable needs our Chord to be its Chord.

So Phase 1 upgrades Pi and ports Chord together.

### Is there an official Pi plugin API? No. You're right to wait.

- The plugin machinery exists in Chord on `main`. The `createPlugins({ api: { name, versions }, kinds })` call does three things:
  - It checks plugin imports against a versioned app API.
  - It treats files named after a kind (`worker.ts`, `web.tsx`) as facets of that kind.
  - It refuses direct imports of Chord.
- Pi's own API for agent plugins is a proposal only: `packages/chord/docs/p3-features/book.md`, "The Plugin API", meeting prep dated 2026-11-03.
  - The proposed API is `@p3/app/v1` with seven clusters. Cluster A ("the agent's turn") is Durable's `Extension` contributed to a `HarnessExtensions` registry from a worker facet.
  - Open question 11 in that document asks whether v1 is "the seven clusters as listed".
  - No code in the repo imports `@p3/...` or defines `HarnessExtensions`. The coding agent dropped its Chord dependency and still uses its current extension API.
- The building block Pi will use already ships: `registryReader` in `pi-durable` (example `packages/durable/test/examples/37-harness-registry.ts`). It feeds a Harness its extensions from a Chord registry.

### How Chord's plugin model fits your requirements

- **Only the kinds Supernova declares get loaded.** Discovery and builds only recognize facet files of the kinds the app declares (`discover.ts`, `build.ts#kindOf`). If Supernova declares `worker` and `supernova`, a Pi plugin's `web.tsx` and `tui.ts` are never built or run. Its `worker.ts` is.
- **Pi plugins compile against Pi's API, not ours.** A Pi plugin imports Pi's API name (for example `@p3/app/v1`). To load it unchanged, Supernova must provide that module and Pi's core contracts and registries as host packages. Supernova becomes an implementation of Pi's plugin API, so plugin authors never import a Supernova module for agent behaviour.
- **One checked API name per app, but extra packages are allowed.** `createPlugins` checks versions for exactly one API name. A Supernova UI module (say `@supernova/plugin/v1`) can still be listed as a host package for the `supernova` kind only, without upstream changes. That module would not get the version check. Asking Pi for multiple API names is an option.
- **Supernova UI can come from a separate plugin.** A separate package can import the Pi plugin's contract files as a pinned dependency and contribute Supernova renderers. "Inject a supernova facet" therefore does not require forking the plugin.

### The app kit is the wrong layer for Supernova

Agreed. `startServer` owns all of these:

- the data directory layout and one Chord store per server
- workers per address
- owner links and cookie sessions
- a web base bundle built by esbuild at start

Those conflict with the Vite client, the Electron shell, per-session SQLite files plus the catalog, and the desktop's local API child. The low-level parts fit: `createHost`, `createPlugins`/`createPluginRuntime`, optionally `createHttp`, `/surfaces`' `startClient` and `keepConnected`, and `/react`.

### p2: Pi's reference app on Durable and Chord v2

`apps/p2` (imported 2026-11-03, `05dc8d2`) is a self-hosted Durable UI built from Chord plugins: about 64k lines and 32 plugins. Its README says it is an unsupported prototype that "will be gone soon". We read it for patterns and import nothing from it. What it shows:

- **It doesn't use the app kit.** It builds on `createHost`, `createPlugins`, `createWorkers`, its own `node:http` server, and `webSocketLink` over its own `ws` server with a capped socket (`src/hosts/server.ts`), like our `runtime-socket.ts`. Its web UI is its own esbuild bundle. This confirms the low-level route.
- **Its own plugin API.** `@p2/app/v1` re-exports Chord plus p2's runtime, split by kind (`src/api/v1/{index,node,server,worker,web,tui}.ts`), with `createPlugins({ api: { name: "@p2/app", versions: ["v1"] } })` (`src/hosts/plugins.ts`). Agent extensions come from a registry read with `registryReader`-style composition (`durableRegistry(extensions, switches, …)` in `src/runtime/worker.ts`). This is the clearest preview of the shape Pi's API will have. It is still p2's, not Pi's.
- **One worker process per session.** Each session runs in its own forked worker (`createWorkers`, `src/hosts/session-workers.ts`), with the Harness opened in a `self.open` native on the session's own SQLite file (`openNodeSqliteStorage`). The server relays clients to the session's worker by contract placement (`hostAddress: sessionHost`).
- **The windowed view.** `Chat.view` follows Durable's window directly with `self.follow(observeConversation)`. Clients merge it with `ConversationTranscript` and page older entries through a `Chat.entries` method over `Conversation.entries()`. Measured: opening sends 50 entries instead of 101. Our design differs because we build our own document (turns, undo, checkpoints) on the server, so we read history server-side (1a) instead of merging on the client.
- **State.** It uses persisted `defineState` documents, `self.derive`, `self.writable` exposed through a derive, and `self.follow` only for Durable views.
- **Schemas.** It types open values with a pi-schema cast (`schema as Schema<T>`, `src/runtime/schema.ts`), which is the replacement for our `json<T>()`.

**Risk to watch:** p3 is being built on the app kit. If Pi's plugin API v1 re-exports app-kit objects (`AppInfo`, `WorkerInfo`, `Sessions`, `Files`) or assumes one worker process per session, Supernova must serve those contracts too. Phase 4 depends on this.

## Phase 1: upgrade Pi to 1.5.x and port to Chord v2

Goal: same product behaviour on current Pi and Chord v2. No new features.

### Decided

- **Pi comes from a pinned `main` commit, not a release (temporary).** We need commits that are only on main. The current pin is `a57438e` (2026-11-03). Since `ed4f488`, Chord v1 is deleted: v2 is the root export, and `/http`, `/plugins`, `/surfaces` and the other Node components are exported, so the `/next` question is gone.
  - We build the tarballs ourselves: a throwaway script clones Pi at the pinned SHA, builds it, runs `npm pack` on the packages we use, and rewrites their internal dependencies to the local tarballs. Supernova pins them with `file:` paths. The script is unpolished and unpublished, and it goes away once a Pi release has what we need.
  - Packages: chord, pi-durable, pi-coding-agent, pi-ai, plus their internal dependencies pi-schema, pi-telemetry, pi-codemode, pi-agent-core, pi-mcp and pi-tui. pi-env is not needed.
  - Pi's preview registry (`pkg.earendil.com/<pkg>@<sha>`) would replace the script, but it needs an auth token.
- **The session-file migration is accepted as one-way.** Sessions are personal, and nobody downgrades. Changelog entry: no downgrade after this release. No backup in the product. The developer's own dev sessions are backed up at `~/.supernova/dev/agent/sessions.backup-pi-1.2.0-20261103-130434` (241 files, checked identical to the source).
- **Node 24.** `mise.toml` pins `node = "24.22"` and `@types/node` moves to 24. Pi main needs at least 22.19. Electron 44.10 bundles Node 24.22.1, so the desktop's server already runs on 24, and dev now matches what ships.

- **History is read only through `Conversation.entries()` and the view's window (agreed).** History means every committed entry on the current branch, fork chain included, oldest first. It is not the model context, which comes from `conversation.context()`. Phase 1 keeps the server-built session document. Merging Durable's window on the client, as p2 does, is a possible Phase 2 item if the rebuild per update proves costly.
  - `SessionFile` keeps the branch's history cached in memory. It also keeps one Durable watch of the current branch, whose current value supplies the newest entries and the live documents (`pi.live`, `pi.usage`, `pi.agent`).
  - A snapshot reuses what it already holds and queries SQLite only for entries missing *before* the window. With `tail` the newest cached entry:
    - The window has no `before`, or `before <= tail`: nothing is missing. Take the window's entries after `tail`. No query.
    - `before > tail`: entries were committed between the cache and the window. Query `entries({minEntryId: tail + 1, maxEntryId: before})` once, then append the window.
    - First open (empty cache): query everything up to `before`, then append the window.
  - Entry IDs are not contiguous within a conversation (the session allocates them), so the gap check uses the view's `before` field and never `id + 1`.
  - The window counts entries, not turns: Durable's default is 50, then appends, then trims to 50 past 100. Its size affects only how often a gap query runs, never correctness. A run longer than the window loses nothing, because the gap query fills what left it.
  - While a run streams, partials change `pi.live` but add no entry, so a snapshot runs no query.
  - `session-snapshot.ts` is unchanged.

- **Followed state moves into Chord objects (option C), in Phase 1.** Four classes own state that clients follow live. Each keeps its logic and its file, but its published state moves into a document of a local Chord object, and Chord owns its lifetime:
  - `SessionWorker` → `Session {sessionId}` (document `supernova.session`). The factory opens the worker with `self.open` and gives it a `write(edit)` function. `publish()` edits the draft instead of replacing the document: it pushes only new entries and replaces only the small fields (`live`, `usage`, `context`), and assigns a history page whole only after navigation. `SessionRuntime`'s worker map goes away.
  - `SessionBoard` → `SessionDirectory {}`.
  - `LoginSessions` → `ProviderLogins {}`.
  - `Terminals` → `Terminals {}`, with one document for the list and one keyed document per terminal's output. Output is written with `appendText`, and trimmed with slack (from 256 KB down to 192 KB) so the full-string rewrite happens once per 64 KB, not on every chunk.
  - The remote services in `runtime-services.ts` (what the browser holds) expose the local objects' members and keep the Zod parse. `cell`, `listener`, `resource` and the per-client copies are gone.
  - Classes that need another object's state get a reference from the factory (`self.get(SessionDirectory, {})`) through their constructor, so their tests can pass a fake. Tests of the objects themselves run on an in-memory Chord host.
  - The browser receives exactly what it does today.
- **The agent-runtime rule "features are plain TypeScript, Chord is only the remote boundary" is rewritten in Phase 1.** It was written for Chord v1. `docs/internal/agent-runtime.md` will say that followed state and lifetimes belong to Chord objects, and logic stays in classes and functions.

### Still open for Phase 1

- Who keeps a `Session` object alive when no tab holds it (see 1b).
- Keep `ServiceResult` in Phase 1 (proposed), and whether to ship one PR or two.

### 1a. Pi API breaks (not Chord)

| Change | Where it hits us |
| --- | --- |
| Durable 1.5 removed `Conversation.viewState()`. `ConversationView.entries` is now a **window** (newest 50, trimmed at 100) with head markers in place. It no longer holds the active transcript. | `pi/session-file.ts` (`view()`, `follow()`, `branchHistory()` uses `view.entries` and `head`). This is the riskiest change. Use `Conversation.watch(ctx, window)` or `observeConversation`, and `Conversation.context()` for the model's transcript. |
| `defineDoc` requires `checkpointWhen` (1.4). | `pi/lib/session/session-state.ts` |
| pi-ai no longer exports TypeBox (`TSchema`). Tool schemas are JSON Schema checked by pi-schema. | `pi/lib/tools/tool-definition.ts`, `pi/extensions/legacy/extension-bridge.ts`, `features/session-runtime/tools/web-fetch.ts` |
| Durable SQLite storage auto-migrates to schema v2 on open (1.4). A migrated file cannot be opened by 1.3 or earlier. | Every session file. This is a one-way user-data migration. |
| Watch listeners get `WatchCall` (`kind: "value" \| "failed"`), and `WatchEnd` uses `kind`. | Any watch we keep after 1a. |
| `pi.live` keeps `runFailure` after a failed run. | Check that idle detection uses `run === undefined`. `session-worker.ts:202` already does. |

Verify:
- `bun run typecheck`, `bun run test`, `bun run test:timeline`.
- A new integration test that opens a session file written by 1.2.0. It should check that the session migrates and its history, turns and checkpoints load.
- A long-session test where history crosses the 100-entry window, then undo and revert across a compaction.

### 1b. Chord v1 to v2

| v1 today | v2 |
| --- | --- |
| `remote(name, { input, variants })` in `packages/contracts/src/services/*/services.ts` | `remote(name, { params, hostAddress: () => Server(), variants })`, with `Server = hostKind("server")` in `lib/protocol.ts` |
| `json<T>()` = `Type.Unsafe` | A pi-schema `Schema<T>` cast over `unknown()`. Zod stays the one boundary check. Chord refuses schemas with non-enumerable keys, so TypeBox `Unsafe` may be refused. Verify. |
| `MembersOf<typeof X>` | `Reference<typeof X>` / `Held<typeof X>` |
| `self.state({ x: cell(...) })` + `self.listen(listener(...))` + `replace(..., {diff: true})` | The remote object exposes a local object's document: `self.get(SessionDirectory, {}).sessions` |
| `self.resources({ document: resource({ open }) })` | `self.open(open, close)` |
| `replicatedState` in `SessionBoard`, `Terminals`, `LoginSessions`, `SessionWorker` | Documents (`defineState`) of local objects, changed with `doc.change(draft => …)` (see "Decided") |
| `SessionRuntime`'s `Map<sessionId, Promise<SessionWorker>>` | One `Session {sessionId}` object per session. Chord creates and ends it, and closes the worker with it. A local object with params lives only while referenced, so something must hold it while a run is active and no tab is open (open question). |
| `acceptWebSockets(...)` in `apps/server/src/runtime-socket.ts` | `host.accept(webSocketLink(boundedSocket(ws)), { principal: { kind: "owner" } }, ctx)` per connection |
| Client: `host.get(X, {}, { at })`, `handle.ready`, `onStatus("gone")` | `client.connect(link, { principal }, ctx)`, `await client.load([], ctx)`, then `host.hold` (sync) or `await host.get`. "Gone" comes from watching `ref.state` for `ended`/`failed`. |
| Every call without a context | Context last, required (`BACKGROUND_CONTEXT` at the edges) |

Files: `apps/server/src/{server,runtime-socket}.ts`, `packages/agent-runtime/src/runtime-services.ts`, the four `replicatedState` owners, `packages/contracts/src/{lib/protocol.ts,services/*/services.ts}`, `packages/web/src/runtime/transport/runtime-client.ts`, `packages/web/src/features/workspace/api/terminal/terminal-session.ts`, `packages/web/tests/support/fake-state.ts`, and `apps/desktop/tests/process.test.ts`.

Verify:
- Typecheck, unit and integration tests, timeline and e2e tests.
- Manual checks:
  - Kill and restart the server mid-stream. The client should reconnect with a fresh snapshot.
  - Close a terminal while a tab shows it. The "gone" state should appear.
  - Run a long streaming answer and compare frame timing with the current build.
  - Open a packaged desktop build against its local API child.
  - Close every tab while an answer streams, then reopen the session. The run should have finished, and the session should show the whole answer.
- Integration tests per object: the ops a `Session` publish emits during streaming (appends only, no `["r", …]` and no whole `entries` array), and that a terminal chunk is one append op.

Docs: `docs/pi-compatibility.md` (it says Pi 1.1.0; update to the new version), `docs/internal/{architecture,contracts}.md` (cells and `MembersOf` wording), `docs/internal/agent-runtime.md` (the rule above, and "Streams" and "Serving a feature" rewritten for Chord objects), and a `CHANGELOG.md` entry for the session-file migration (no downgrade).

## Phase 2: let Chord v2 replace our plumbing

Each item is optional and independent. Do one only when it removes code without losing behaviour. Ordered by value.

1. **Terminal output as a byte channel.** p2 sends PTY bytes over a separate WebSocket and keeps only control in Chord (`apps/p2/plugins/terminals/service.ts`). Consider it only if measurements show the output documents cost too much.
2. **Reconnect loop.** `runtime-client.ts` reconnects every 1 s forever. Chord's `keepConnected` (root export, `surfaces/connection.ts`) adds a backoff from 250 ms to 5 s and reconnects at once on visibility or online events. It also drops stale sockets (25 s without pings) and times out a connect after 20 s. This helps remote use.
3. **Server socket.** Chord's `/http` links endpoint has a capped output buffer, a heartbeat, a host allow-list and an `Authenticators` registry. We have the cap, no heartbeat and no auth. Adoption is blocked by its `Origin` check: the desktop renderer (`supernova://app`) and the Vite dev proxy likely send an origin it refuses. Verify, and revisit together with authentication. Until then, keep our `ws` server.
4. **Errors.** v2 carries `PluginError(code, message, details)` across links. That could remove the `ServiceResult` envelope (`run`/`fail` in `runtime-services.ts`, `unwrap`/`runtimeError` at 35 web call sites). The trade-off is that `code` is a plain string, so typed `FailureCode<Method>` would need a typed helper. Decide before touching it.
5. **Session publication.** Today `SessionWorker` re-reads the document through a publication queue. A derive over `self.follow(observeConversation)` and `observeDoc(SessionStateDoc)` would replace that queue and its "never move backwards" logic. Durable's synchronous observers give commit-coherent updates. This only works if `session-snapshot.ts`'s bounded paging fits a derive. Prototype first.
6. **Small ones:**
   - Terminal output bounding with `/output`'s `OutputBuffer` (exact dropped counts, byte and line limits).
   - `/react`'s `useHold` and `useWatch` where components hold one object.
   - The catalog's migration runner with `/sqlite`'s `applySqliteMigrations`. Low value, and it touches user data, so last.

## Phase 3: plugin host, no public API

Goal: Supernova loads, reloads, installs and reports Chord plugins, using internal fixture plugins only. Publish **no** plugin API, so nobody writes Supernova-only agent plugins.

Requires the Chord release that exports `/plugins` (unreleased today).

1. **Extensions registry.** Add a `HarnessExtensions` registry on the server host. Session harnesses read it through `registryReader`.
   - The legacy-extension bridge (`pi/extensions/`) contributes to the same registry. That gives one path into Durable.
   - Per-cwd legacy extensions need a selection rule, because a registry is host-wide.
   - This replaces the install/uninstall diffing in `session-file.ts`.
2. **Plugins component.** Call `createPlugins` with:
   - kinds `worker` (Node, loaded in-process on the server host) and `supernova` (browser, unused until Phase 5)
   - a user root under the agent directory (`~/.supernova/userdata/agent/plugins`)
   - `api` left unset until Pi names its API (Phase 4)
3. **Reload and install.**
   - Reload uses the plugins watcher, `build` and `rollout`, exposed through the existing Settings → Extensions update action.
   - Install uses `installPlugin({ git, ref } | { npm, version })`. It runs `npm install --ignore-scripts`.
4. **Failure reporting.** Load and reload failures (`PluginFailure`, `mapStack`) appear as session notices and in settings.

Verify:
- Fixture plugins load and their tools reach a session.
- A broken plugin is left out and reported, and the rest load.
- Editing a plugin reloads it without restarting the server. A running tool call finishes on its old code, as Durable's reload rules say.

Decisions:
- **In-process vs one worker process per session (`/workers`).** In-process is simpler and matches today. Per-session workers isolate crashing plugins and match p3's host model; p2 already runs one worker per session (`src/hosts/session-workers.ts`). I recommend in-process unless Pi's API turns out to require worker hosts.
- **Project-level plugin roots.** Opening a project would run its code, which is the same trust issue extensions have today.

## Phase 4: load Pi's durable plugins (blocked on Pi)

Start when Pi publishes its plugin API v1: a name and version, its worker modules, and its core contracts and registries.

1. Implement Pi's API modules as host packages for the `worker` kind. Set `api: { name: <Pi's>, versions: [...] }`.
2. Serve Pi's non-UI clusters on the server: the agent's turn (A), conversation control (B), input (C), environments and models (D), and state (G).
3. Answer Pi's renderer-independent questions (cluster E, `Questions`) with Supernova's own dialogs, so plugins that ask the user still work. This replaces the "dialogs answer no" rule of the legacy bridge.
4. Plugins with UI facets: load the non-UI facets and ignore `web`/`tui`. Report "this plugin has a UI Supernova doesn't show" once, like the legacy bridge's notices.

Verify: Pi's ported litmus examples (hello, permission-gate, todo, plan-mode) load unchanged from their published packages.

Watch item: Pi's API may assume app-kit objects or per-session worker addresses (see "Risk to watch" above).

## Phase 5: Supernova UI facets (design open)

A `supernova` facet kind (`supernova.tsx`, `contract.supernova.tsx`) runs in Supernova's web client. Its pieces:

- **Supernova's UI API.** A host package for that kind only, with registries for tool renderers, entry renderers, slots and commands.
- **Script delivery.** The server builds the browser scripts. The Vite app loads them with `/surfaces`' `startClient`, which reloads them in place when they change. Serving the scripts must fit our CSP.
- **A companion plugin.** A Pi plugin's Supernova UI can be its own plugin that imports the Pi plugin's contracts.

Out of scope until Phase 4 shows what Pi plugins need.

## Asks for Pi upstream

- A published plugin API v1, and whether its worker facets depend on app-kit objects.
- Support for more than one API name in `createPlugins` (Pi's plus the host's own), or confirmation that extra host packages are the intended pattern.
- A release with v2 at the root and the Node components exported.

## Open questions for you

1. ~~Phase 1 on `/next` or wait for a release?~~ Decided: a pinned main commit, built locally (Phase 1, "Decided").
2. In-process plugins, or one worker process per session?
3. Global plugin root only, or project roots too?
4. Keep `ServiceResult`, or move to `PluginError` (Phase 2.4)?
5. Is `supernova` the kind name you want (`supernova.tsx`)?
