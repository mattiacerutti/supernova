# Chord v2 and Pi plugins: implementation plan

Temporary handoff for implementation agents. Keep this file current as decisions are resolved and work is completed; it is not a permanent architecture guide. The boundaries and guarantees below are agreed. Exact files, helper APIs and class decomposition are implementation choices unless stated otherwise.

**Status:** Phase 1 implemented locally, uncommitted; see "Phase 1 outcome" below for what was verified and what remains. Later phases record direction, not authorization to build them now.

## Direction and upstream baseline

- Replace custom state, lifetime, routing and subscription plumbing with independently composable Chord components. **Do not adopt the app kit.** Preserve Supernova's product workflows and independent session storage.
- Eventually load **unchanged Pi backend plugins**, with custom `supernova.ts(x)` UI facets. Ignore Pi `web`/`tui` facets; do not adapt their UI APIs or invent a competing Supernova agent API.
- Supernova currently pins Pi/Chord 1.2.0. Upgrade the dependency graph and port Chord together: intermediate v1 releases already break our APIs, and incompatible Chord/Durable contexts are not a supported bridge.
- Latest inspected upstream: `.context/pi` at `1bc7076b2`. There, Chord v2 is the root export and the component subpaths are public. npm availability has not been rechecked; do not infer exports from the package version alone. Target a coherent pinned main build until a suitable release is verified.
- p2 is a useful reference, not a dependency or a stable compatibility promise. It composes Chord without app kit, runs a host/process per session, and implements `@p2/app/v1`. General Pi coding-agent plugin compatibility remains to be proven.

Useful upstream starting points, relative to `.context/pi`:

| Question                                         | Reference                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Host identity, placement and lifetime            | `packages/chord/src/host/README.md`                                             |
| Session-host routing and liveness                | `apps/p2/src/hosts/{server,session-workers,worker}.ts`, `src/runtime/worker.ts` |
| Catalog and owner/worker interfaces              | `apps/p2/plugins/sessions/{contract,server}.ts`                                 |
| Status reporting and stale-worker protection     | `apps/p2/plugins/status/{contract,server,worker}.ts`                            |
| Sidebar composition                              | `apps/p2/plugins/sessions/web.tsx`                                              |
| Backend plugin loading and extension composition | `apps/p2/src/hosts/plugins.ts`, `src/runtime/durable.ts`, `src/api/v1/`         |

## Phase 1: coherent Pi upgrade and Chord v2 migration

**Goal:** preserve product behavior while moving ownership and transport plumbing into Chord. Also regroup session APIs into saved sessions, live status, and chat.

**Keep:** Zod boundary validation, `ServiceResult`, existing HTTP/WebSocket setup and buffer cap, independent session SQLite files, checkpoint/recovery behavior, and the publication queue/barrier.

**Outside this phase:** plugin loading, app kit, `/http` adoption, frontend build/delivery changes, and error-system replacement.

### Agreed object model

A host is a Chord runtime container, not necessarily a process. Use **one server host and one host per session, all in the existing server process for Phase 1**. Separate session hosts give execution and future worker plugins a natural session scope without passing session IDs through every internal object/registry. One process per session is the future goal, not part of this migration.

```text
Browser host ── one WebSocket ──► Server host
                                  ├─ Sessions {viewId}       [remote]
                                  │    └─ SessionCatalog {}   [local]
                                  ├─ SessionStatus {}        [remote]
                                  │    └─ SessionStatusStore {} [local]
                                  └─ Session-host routing
                                       ├─ Host A
                                       │    Chat {sessionId: A} [remote]
                                       │      → SessionRuntime {} [local]
                                       │        → SessionWorker A
                                       │          → SessionFile / Harness / SQLite A
                                       └─ Host B: same structure, independent execution/storage
```

These names identify **Chord contracts/objects**, not mandatory new classes. Existing classes/functions retain product logic. Local empty-params objects live with their host; `SessionRuntime {}` is one instance per session host. Remote objects are reference-driven and principal-specific, so they provide caller access without owning shared execution.

#### Saved sessions: `Sessions` and `SessionCatalog`

- Local **`SessionCatalog`** owns access to existing catalog storage and notifies live listing objects of relevant catalog changes. Query only the requested windows; do not replicate every saved session as one global list.
- Remote **`Sessions {viewId}`** lives on the server host and combines live listing with management operations currently split between `ProjectsService` and `SessionsService`. There is no separate `SessionList` contract. Non-session project functionality stays with projects.
- Its browser **owner variant** exposes observable `items`/`hasMore` and methods to select a listing/search query and load more. Selecting a query initializes a bounded window; `loadMore()` expands it. These methods update live state rather than return disconnected pages for browser-side merging. Keep get/create/fork/rename/pin/archive and existing model/composer query capabilities.
- Each view owns its query, requested depth and loaded results. `viewId` distinguishes independently controlled listings even for the same owner principal; keep it stable for the consumer's lifetime, not per render. Multiple references with the same parameters/principal share a view. Match the existing sidebar's independently loaded project sections and search with separate views where needed, not an assumption of one active project.
- Its internal **worker variant** offers only metadata operations on the caller's own session, without creating a browser listing. The view ID is not authority: worker identity comes from the trusted principal. Derive exact methods from existing writes, not unused capabilities.
- Fork, archival and similar operations remain explicit product workflows, not just catalog writes. In particular, coordinate work settlement and resource closure before destructive storage cleanup.

**Why:** keep p2's combined listing/operations interface, but load records incrementally. Chord replicates each view's live state; Supernova maintains its query results. This replaces the browser summary-overlay/refetch-signal proposals without mixing metadata into runtime status.

#### Live status: `SessionStatus` and `SessionStatusStore`

- Local **`SessionStatusStore`** owns the map of activity, setup progress, notices and relevant host availability. Retain useful `SessionBoard` behavior, including capped notices.
- Remote **`SessionStatus`** lives on the server host. Its **owner variant** exposes status state directly; its **worker variant** exposes reporting/notification methods. There is no separate reporter contract and no per-client state copy.
- Remove catalog summaries from this state. Titles, pinning and list-order metadata belong to `Sessions`/the catalog.

**Reporting flow:** a session factory gets a reference to `SessionStatus {}`. Contract placement routes it to the server; the session host's trusted worker principal selects the reporting variant. The remote factory binds reports to that principal's session and generation, then updates the local store. Browser owner references observe the resulting changes. The worker variant of `Sessions` works the same way for catalog metadata.

Pass these dependencies into existing worker logic rather than implementing networking there. Session-host links must establish trusted worker identities; today's owner-only browser connection setup does not do this automatically. Reject stale-generation reports after restart and prevent browser impersonation. Host management must also update availability on closure/failure—a crashed worker cannot send a final report.

#### Chat: `Chat` and local `SessionRuntime`

- Rename the remote `SessionRuntimeService` contract to **`Chat {sessionId}`**. Preserve its document and commands: send/abort, history, compaction and checkpoint navigation. This is one Supernova session's interface, not p2's multi-conversation model.
- Place `Chat` on the addressed session host. The browser still supplies the session ID; Chord routes over the existing connection. The server route finds/starts the host instead of forwarding each product method.
- Local **`SessionRuntime {}`** owns the published document and the existing `SessionWorker`, opened/disposed through `self.open`. Its factory receives the session configuration and dependencies.
- **Delete the old coordinator class/map and forwarding role.** Reusing the name `SessionRuntime` does not preserve that coordinator: the new local object owns exactly one session. The command path is `Chat → SessionRuntime → SessionWorker`.
- `Chat` validates, checks permissions, converts failures to `ServiceResult`, delegates commands and exposes state without mirroring. Moving publication to a Chord document does not replace `SessionFile` or add a second durable database.

Server composition owns host routing, admission and lifecycle. **Retain started session hosts until explicit release/archival or server shutdown; no idle eviction in Phase 1.** Client disconnect must not cancel accepted work. This is separate from the short-lived browser listing objects below.

#### Live listings and sidebar lifecycle

Today, paginated project queries supply records and `SessionsService.directory` overlays summaries and supplies live status. Replace that with:

```text
Sessions {viewId}.items + SessionStatus.statuses + optimistic UI changes
```

A listing means **the first N matching sessions in current order**, not an append-only history of returned pages. Catalog mutations must update loaded windows for insertion, rename, pinning, archival and search membership changes. `loadMore()` increases N; it must not skip/duplicate records after reordering. A simple starting implementation re-queries affected loaded windows and publishes their state, coalescing relevant catalog changes. Chord handles replication, not SQL query maintenance. Ordinary status updates and token streams must not trigger catalog re-queries.

The browser owns references to its views. Acquire through Chord and release with the owning UI/resource lifecycle; dropping a JavaScript variable is not release. Chord tracks explicit holds, removes them on release or detected link closure, and tears down a reference-driven object after its final hold (subject to configured linger). Cleanup stops that view's catalog observation and releases temporary listing state, not saved sessions or execution. The local catalog and session runtimes remain host-owned.

A stable `viewId` is identity, not persistence. On reconnect the view may be recreated; retain enough browser intent to restore its query and requested depth, then observe fresh results. Preserve optimistic updates, new-session visibility and sorting without maintaining a second browser summary feed. Status retention must not grow into another historical catalog or silently discard required notices.

### Engine, history and publication constraints

- Read committed branch history through `Conversation.entries()` plus the observed view window; use `conversation.context()` only for model context. Keep the server-built session document in Phase 1.
- `SessionFile` should cache branch history and keep one Durable observation for newest entries/live documents. Fill missing older entries on first open or when commits have fallen out of the window. Use window boundary markers, not assumptions that entry IDs are contiguous. Partial token updates should not query history.
- The observed window is not the full transcript. Verify cache invalidation/reconstruction across fork chains, compaction, undo/revert and branch changes; a long run must not lose committed entries when the window trims.
- Preserve bounded published history (currently 20 turns / 2 MiB). Ordinary growth may need appends, prefix removal/splices and metadata edits. Avoid whole-document/history replacement on streaming chunks; navigation can replace a bounded page.
- **Keep the publication queue and `publishAfter()` barrier.** Durable's per-commit coherence does not make separate input and turn-metadata commits one atomic product update. Chord ownership changes the publication destination, not product ordering guarantees.
- Preserve admission, recovery, Git checkpoints and accepted server-owned work across disconnects/restarts. Neither reference management nor process routing implements these guarantees automatically.

### Other state and code organization

Move followed state/resource ownership into Chord without rewriting behavior unnecessarily. Beyond sessions, review `LoginSessions` and `Terminals` individually: server-local owners are the current direction, but their detailed design is not settled by this session plan.

- Login flows must outlive browser references as they do now.
- Terminals remain server-owned; observing/releasing output does not own the shell. Preserve list versus per-terminal output subscriptions and bounded incremental output. Keyed output documents and trimming with slack are a candidate, not a fixed helper/API design.
- Stateless operations can delegate directly to existing classes. Do not add a local wrapper for every remote service.
- Keep the `session-runtime` feature name. Internal local contracts/factories stay with features in `agent-runtime`; remote contracts, placement and serializable data stay in `contracts`. Server/session factory composition is separate, but exact files are flexible.
- Revise the existing “Chord only at the remote boundary” rule when implementing: Chord owns followed state/lifetimes; classes/functions retain product behavior.

### Implementation order

1. **Establish reproducible dependencies.** Select and record one exact upstream main commit containing the required APIs; build all required Pi packages from that commit, not a floating `main` reference or mixed runtime/context versions. Use a small local script to build/pack tarballs, rewrite internal Pi dependencies to those tarballs, and pin them with `file:` paths. **This is disposable release-gap tooling: keep it simple, with no generic packaging framework, custom registry or automated upstream-update system.** Include required transitive Pi packages and ensure a clean checkout can obtain the pinned artifacts and install/build in CI and Desktop. Once a published release contains the required APIs, switch to normal package versions and remove the script/tarball workaround. Target Node 24 (`24.22` was selected), matching the desktop runtime and updating types/tooling coherently.
   - _Done locally:_ `scripts/pi-main/pack.ts` builds the 10 packages from `1bc7076b2` on Node 24 into `vendor/pi/*.tgz` (13 MB, committed; `COMMIT` records the SHA). Pi packages are pinned with `file:` in each workspace, and the root `overrides` points every internal Pi dependency at the same tarballs. A `file:` path inside a tarball resolves against the installing project, so rewriting dependencies inside the tarballs does not work with Bun. `undici` went from 8.10.2 to 8.12.3 to match pi-coding-agent, so a single copy of pi-ai resolves. Node is `24.22` in `mise.toml` and CI, and `@types/node` is `^24.19.2`. A project `.npmrc` points at the public npm registry. A clean `bun install --frozen-lockfile` passes, with one copy of each Pi package.
   - _Verified:_ an unpacked `electron-builder` build packages the server bundle and web assets. The packaged app's Electron binary (Node 24.21) runs the server, which creates, lists, routes `Chat` to its session host, reports status and archives. CI jobs all use node `24.22`. CI itself has not run on this branch.
2. **Adapt the Pi integration.** Start with `pi/session-file.ts`, session state definitions, tool schemas and watch adapters. Known break areas: removed `viewState`, windowed history, `defineDoc` checkpoint settings, TypeBox removal from pi-ai, new watch callback shapes, contexts, and retained `runFailure` (not a running-state indicator). Confirm exact APIs against the selected pin.
3. **Port contracts and host composition.** Replace v1 `input`/`MembersOf`/cells/listeners/resources with v2 params/placement/references/state/resource APIs. Port client reference/reconnect handling and the existing bounded socket adapter. Introduce session-host routing, worker identity/generation handling, and `Chat → SessionRuntime`; remove coordinator forwarding.
4. **Implement catalog/status separation and update callers together.** Add local owners and owner/worker variants, move session operations into `Sessions`, connect cross-host reports, and replace sidebar summary overlays with progressively loaded live views. Wire view acquisition/release and query/depth restoration on reconnect. Port remaining followed-state owners after their focused review.
5. **Verify behavior and finish migration docs.** Update compatibility/architecture/contracts/runtime guidance and release notes to match implemented behavior, not illustrative plan filenames.

The session-file migration is accepted as **one-way**, with a release note that downgrade is unsupported. No automatic backup feature is planned. Use disposable 1.2.0 fixtures for migration tests, never live user/dev sessions.

### Phase 1 outcome

Steps 2–5 are done. Where they landed, for review:

- **Contracts:** `lib/protocol.ts` (`ServerHost`/`SessionHost`, `RuntimePrincipal` = owner | server | worker{sessionId, generation}). Every remote contract ends in `Service`. Sessions use three, as p2 does: `SessionsService {clientId}` (one per browser tab: its `view`, a window per shown sidebar project and its open session's record, plus the operations and a one-shot paged search), `SessionStatusService {}` (live status; session hosts' one reporting channel, including generated titles), and `ChatService {sessionId}` on the session host (the conversation; its `server` variant serves `create`). `services/projects` is gone.
- **Layout (agent-runtime):** `composition/` (`runtime.ts`, `server-host.ts`, `session-hosts.ts`, `session-workflows.ts`) is the only code that knows every feature. Each feature's Chord objects live in its `facet.ts`; cross-feature work is passed in (`SessionWorkflows`, `isCurrent`). ESLint rejects loose source files and imports of `composition/` from features.
- **The catalog is the record's one source:** the conversation document carries no title, pin, project or worktree, and no session host keeps the record. The page reads it from its tab's `SessionsService.view.open`. `rename` and `pin` are catalog writes; `fork` returns the record. Removed on the way: `SessionsService.get` and its worker variant, `SessionListService`, `ChatService.refresh`/`stopWork`/`record`, `recordChanged`, `touch` and `proposeTitle` (now `SessionStatusService` reports). `create` stays one step with rollback. Archive aborts the run as part of releasing the host; a server shutdown does not, so interrupted turns resume.
- **Live status:** the `SessionStatus` class in `features/sessions/status/` (map, notice cap, change events); `SessionStatusService` mirrors it per browser and takes session hosts' reports. Workflows and the server host call the class directly; there is no status store.
- **Followed state:** classes own it (`SessionStatus`, `Terminals` with its 256 KB scrollback trimmed to 192 KB, `LoginSessions`, the catalog); each remote object publishes it with Chord's `self.writable` + `self.derive` (`published` in `lib/chord/state`), and Chord diffs each value. No local stores, no document edits, no `applySession`. `SessionRuntime` (it owns the session's worker) is the only local object.
- **Decisions taken here:** the catalog stays in SQLite, never in a Chord document. Each tab's `SessionsService` view subscribes to the store's catalog change callback and re-queries its shown projects' windows and its open record on every catalog write, one refresh at a time, committing nothing for a window that did not change. This replaces the plan's `Sessions {viewId}` (one listing object per sidebar section, search and operations): operations, the sidebar and search changed on different schedules, so they are separate. Search is a one-shot request again. Status holds only sessions that are running, being set up or have notices; absent means idle. A session list lingers 10 s after its last release, so a reconnect within that time reuses it.
- **History:** `SessionFile` caches the branch and reads only the gap before `view.before` from storage.
- **Docs:** agent-runtime, architecture, contracts, session-runtime, web guides, `docs/pi-compatibility.md` and the changelog are updated.

Verified: typecheck, lint, prettier, all unit and integration suites (agent-runtime 198 integration tests, web 160, desktop 51, server 4), e2e 30/30, and the packaged Desktop smoke above. New tests: a disposable Pi 1.2.0 session file (`tests/support/fixtures`) migrates, keeps history and turns, continues and undoes; 60 turns with a compaction keep every turn across the Durable window after a reopen, and revert across the compaction. The long-history test fails when the gap read is removed.

Not verified:

- CI on this branch.
- A signed or notarized package. Local `package:mac` needs Xcode 26's `actool` for `icon.icon`; the smoke used `-c.mac.icon=icons/icon.icns`.
- Frame timing on long streams, and query costs under realistic multi-client load.
- `test:timeline` "sending a message scrolls it to the top…" fails intermittently. It fails on the unchanged base too, so it is not caused by this migration.

### Implementation follow-through

- **Listing maintenance:** choose internal catalog invalidation scope/coalescing against actual write rates. The live-view interface and reference ownership are already decided.
- **Status cleanup:** preserve current behavior, not a new retention policy. Explicit session release removes its status entry and notices; archival and failed-initial-send cleanup use that release path. Browser disconnect and ordinary run completion do not remove the entry. Status is in-memory across server lifetimes. Wire this cleanup into the release workflow explicitly; closing a session host alone does not remove server-owned status.
- **Worker trust:** establish session identity and generations on in-process host links, and assign release/archive/reload workflows. General browser authentication is not being added in this phase.
- **Dependency pin/build:** verify exports and reproducibility; decide PR slicing without shipping a mixed-version runtime.

### Acceptance checks

- Run `bun run typecheck`, `bun run test`, `bun run test:timeline`, relevant e2e tests, and a packaged Desktop smoke test.
- Open a disposable 1.2.0 session fixture and verify migration, history, turns and checkpoints. Exercise long history beyond the Durable window, compaction, forks and checkpoint navigation.
- Two sessions route to independent execution/storage; multiple callers share one execution owner per session. Closing every tab does not stop accepted work. Reopen/reconnect and verify complete, coherent state; exercise explicit release and server restart/recovery.
- Workers can affect only their own sessions; browsers cannot invoke reporting methods; obsolete-generation reports are rejected; host failure clears stale running indicators.
- Listing/search load incrementally without a full-catalog initial subscription. Query/depth changes in one view do not affect another; multiple references to one view share state. Multi-client create/rename/pin/archive and worker metadata changes update loaded windows, ordering, search membership and `hasMore`; loading more after changes does not skip/duplicate records. Check query/replication costs under realistic activity and notice retention; status updates alone do not re-query catalog windows.
- Releasing one reference preserves a still-held view; final release/detected disconnect cleans up its observers without closing the catalog or agent. Reconnect recreates the query and requested depth when needed and yields fresh results.
- Publication remains coherent across input/turn-metadata commits and checkpoint settlement. Inspect bounded incremental updates and frame timing on long streams, including history-window eviction; no full history replacement per chunk.
- Provider logins and terminals retain their ownership semantics; terminal close invalidates observers, while observer release does not close the process. Verify incremental bounded output.

## Phase 2: replace additional plumbing where it pays off

Optional, independently justified improvements after Phase 1. Require less custom code without losing behavior; do not bundle them into the core migration.

- **Session process isolation and advanced lifecycle:** the future goal is one process per session, using `/workers` where suitable. Preserve existing host addresses/contracts while evaluating memory, startup, dependency access, crash recovery and Desktop packaging. Separately consider idle eviction: busy accounting must cover accepted commands, Durable work, checkpoint capture/settlement and pending publication, not just viewers. Prove that eviction/restart loses no work before replacing Phase 1 retention.
- **Connections:** evaluate root `keepConnected` for reconnect/backoff/online handling and `/http` for heartbeat, buffer limits and authentication integration. Verify Vite proxy and Desktop `supernova://app` origin handling before replacing our socket setup.
- **React bindings:** use `/react` reference/watch hooks where they remove custom subscription management.
- **Terminal transport/buffering:** compare the current document approach with p2's separate PTY byte channel and Chord output-buffer utilities. Change only on measured benefit.
- **Errors:** consider replacing `ServiceResult` with upstream transported errors, preserving typed failure handling and validation. Verify the selected version's error API first.
- **Session observation/publication:** investigate `self.follow`/`self.derive` and, if useful, p2-style client window merging. Replace queue/barrier logic only after proving equivalent ordering, bounded history and checkpoint behavior.
- **SQLite utilities:** optionally replace catalog migration plumbing; low priority because it touches durable data.

For each adopted item, compare before/after behavior and costs, and retain reconnect/Desktop/streaming regression coverage.

## Phase 3: plugin infrastructure, no competing agent API

**Goal:** reuse loading, build, reload, install and failure reporting without inventing a Supernova-only backend SDK. Do not build speculative plugins just to justify scaffolding; select an actual upstream backend plugin as an integration target.

- Compose `createPlugins`/runtime components directly, without app kit. Bind the selected upstream API name/version and host packages; p2 currently supplies `@p2/app/v1`.
- Load `worker` facets and extension registries on each session host; load required `server` facets on the server host. Do not put all worker contributions into one global registry.
- Feed Durable extensions from the appropriate registry, reusing `registryReader`/upstream composition. p2's actual registry is `Extensions` (`p2.durable-extensions`); do not assume a hypothetical `HarnessExtensions` token. Bridge legacy extensions where compatible and preserve cwd/session selection.
- Use `~/.supernova/userdata/agent/plugins` as the user root. Reuse upstream install/build/watch/rollout machinery and expose diagnostics through settings/notices. Preserve safe reload behavior for in-flight calls and last-good builds.
- Declare `supernova` as a browser-targeted custom kind when needed for Phase 5. Never load Pi `web`/`tui` facets.

**Open:** project-level plugin roots require an explicit trust decision; backend plugins are trusted code, not a sandbox. Process deployment follows Phase 1.

**Acceptance:** a real upstream backend plugin loads unchanged, reaches only the intended sessions, and survives supported reloads without losing running work. Broken plugins/builds are reported without taking down healthy ones. Installation works through the selected upstream mechanism.

## Phase 4: prove unchanged Pi backend-plugin compatibility

**Goal:** define and test the actual supported upstream backend API, rather than claiming compatibility from a similar loader. p2 has implemented APIs today; broader coding-agent SDK compatibility and future stability remain unproven.

- Provide the selected versioned upstream modules as host packages for backend facets. Plugins import upstream's API, not a Supernova replacement namespace; managed-plugin direct Chord imports remain subject to upstream restrictions.
- Implement the required contracts/registries on the correct server/session hosts: agent extensions, conversation/input control, environments/models, and backend state. Check assumptions about app-kit objects or worker addresses rather than adopting app kit wholesale.
- Implement renderer-independent interactions, such as permission/questions, using Supernova dialogs where required. Do not adapt Pi web/TUI APIs.
- Keep Pi UI facets ignored and make unsupported UI capabilities clear. Use custom Supernova facets separately.

**Acceptance:** representative actual upstream backend plugins load unchanged, including tool, permission/interaction and stateful examples. Record the API/version supported and its limits; do not treat fixtures written for Supernova as compatibility proof.

**Upstream coordination:** clarify SDK stability, required host contracts and release availability. Chord currently version-checks one API name; verify whether extra host packages suffice for the later Supernova UI API or whether multiple checked API names are needed.

## Phase 5: Supernova UI facets

**Goal:** extend our own UI while reusing unchanged backend plugins. Design the UI surface once backend compatibility needs are concrete.

- Use `supernova.ts(x)` facets with a browser-only host API for tool/entry renderers, slots and commands. A companion plugin may depend on the backend plugin's contracts; adding Supernova UI must not require forking its backend.
- Choose frontend build/delivery separately. `/surfaces` handles server-side delivery; root `startClient`/`keepConnected`, `/web` bootstrap and `/react` bindings are independently composable. Preserving Vite is not a requirement, but no app kit or forced application shape.
- Verify CSP, failure/reload behavior, browser and packaged Desktop delivery. Any change to the current headless-server/UI-hosting boundary must be explicit.

**Acceptance:** an unchanged backend plugin gains a custom Supernova renderer without loading its Pi web/TUI facets. Failed UI replacements preserve working assets, and supported reloads behave correctly in browser and Desktop.
