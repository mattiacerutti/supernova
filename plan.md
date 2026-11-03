# Chord v2 and durable plugins: migration plan

Status: draft for review. Sources are the Pi monorepo cloned at `.context/pi` (main, `90b42bc`, 2026-11-03) and the published npm packages. The repository's `.gitignore` already excludes `.context`.

## What I found

### Releases

- Supernova pins every Pi package at **1.2.0**. The latest release is **1.5.0** (2026-11-02).
- In the published `@earendil-works/chord@1.5.0`, the root export is still **Chord v1**. Chord v2 ships under the experimental subpath `@earendil-works/chord/next`. That subpath has the kernel (contracts, hosts, links, documents, registries, `self.follow`, `self.writable`) but no Node components.
- On Pi's `main` (unreleased), v2 moved to the root, v1 moved to `/old`, and the Node components became exports: `/http`, `/workers`, `/plugins`, `/plugins/runtime`, `/app`, `/surfaces`, `/web`, `/react`, `/tui`. The plugin loader is unreleased and only on `main`.
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

**Risk to watch:** p3 is being built on the app kit. If Pi's plugin API v1 re-exports app-kit objects (`AppInfo`, `WorkerInfo`, `Sessions`, `Files`) or assumes one worker process per session, Supernova must serve those contracts too. Phase 4 depends on this.

## Phase 1: upgrade Pi to 1.5.x and port to Chord v2

Goal: same product behaviour on current Pi and Chord v2. No new features.

**Decision needed first: which import path.**
- Option (a): port now against `chord@1.5.0` `/next`. When the next release moves v2 to the root, the switch is one search-and-replace.
- Option (b): wait for that release.

I recommend (a). The server and the web client ship from one build, so wire compatibility is not an issue. The cost is that `/next` is marked experimental, and `main` has changed it since 1.5.0. Those changes are small for us: `host.get` before `load` throws, HTTP denies by default, and new `onError` kinds.

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
| `self.state({ x: cell(...) })` + `self.listen(listener(...))` + `replace(..., {diff: true})` | Mirror the feature's value with `self.follow(attach)` (the feature emits `WatchCall`s with its own ops), or with `self.writable` plus `self.derive`. See 2.1. |
| `self.resources({ document: resource({ open }) })` | `self.open(open, close)` |
| `replicatedState` in `SessionBoard`, `Terminals`, `LoginSessions`, `SessionWorker` | Gone in v2. Replace with a small feature-owned observable that the service follows (2.1 decides which). |
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

Docs: `docs/pi-compatibility.md` (it says Pi 1.1.0; update to the new version), `docs/internal/{architecture,contracts,agent-runtime}.md` (cells and `MembersOf` wording), and a `CHANGELOG.md` entry for the session-file migration (no downgrade).

## Phase 2: let Chord v2 replace our plumbing

Each item is optional and independent. Do one only when it removes code without losing behaviour. Ordered by value.

1. **Feature state into services.** Today `runtime-services.ts` copies every feature value into a cell and diffs the whole value per change. Phase 1 has to pick a replacement anyway:
   - `self.follow` carries the feature's own ops, so there is no full diff per frame. That matters for terminal output and the session document.
   - A derive over a `self.writable` is shorter, but it diffs the whole value per change.
   - Pick per service. Measure the session document with a long transcript.
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
- **In-process vs one worker process per session (`/workers`).** In-process is simpler and matches today. Per-session workers isolate crashing plugins and would match p3's host model. I recommend in-process unless Pi's API turns out to require worker hosts.
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

1. Phase 1 on `chord@1.5.0` `/next` now, or wait for the release with v2 at the root?
2. In-process plugins, or one worker process per session?
3. Global plugin root only, or project roots too?
4. Keep `ServiceResult`, or move to `PluginError` (Phase 2.4)?
5. Is `supernova` the kind name you want (`supernova.tsx`)?
