# Pi Harness v2 Migration Options

Pi is replacing the `AgentSession` SDK Supernova uses today with a new durable agent engine and a Chord-based service/wire stack. This doc compares the three ways Supernova could adopt it, **assuming the planned design is fully implemented** — not the current state. Readiness signals are at the end.

## Background: what changes

**New engine: `@earendil-works/pi-durable`** (published on npm, versioned `0.99.x` outside the monorepo's lockstep). Formerly known as "pico". It replaces both the old `createAgentSession` SDK and the intermediate lane-based `AgentHarness`. Four durable primitives:

| primitive     | purpose                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **entries**   | immutable append-only transcript; paged queries, never fully resident                                                                             |
| **documents** | current JSON state (model, UI status, your checkpoints), stored as Chord ops; declarable `rewindable` with fork policy, versioned with migrations |
| **tasks**     | durable units of work (generation, tool call, compaction, background jobs) with a scheduler, dependencies, and per-kind crash recovery            |
| **memos**     | first-writer-wins idempotency receipts (e.g. a hook's approval answer surviving a crash)                                                          |

One writer per session, atomic commits to one ordered log, SQLite/JSONL/memory backends. Behavior is pluggable task kinds; hooks (`before_run`, `before_tool`, …) can mutate, block, or wait with durable scratch. Clients consume derived views via `watch()` (snapshot + ordered updates, frame-coalesced).

**Chord** is the application-neutral layer around it: service declaration/consumption (local or remote), replicated state, and the facet plugin host/bundler. `pi-durable` depends on it for `Context`, strict JSON, and the document op format — so durable state is _already_ in the representation Chord replicates to remote consumers.

**`pi-protocol` / `pi-server` / `pi-client`** sit above Chord and are optional: the protocol is only an envelope (framing, handshake, request correlation, cancellation, subscriptions) carrying opaque JSON; pi-server adds session addressing `{serverId, sessionId, attachmentId}`, multi-client attachment with stale-route fencing, and per-session worker processes.

**Extensions** are Chord facet bundles with per-environment entries (`session` runs beside the engine; a presentation entry is shipped to the client at attach). Supernova would define its own entry name and its own UI slot contract.

Much of Supernova's custom wiring maps onto these primitives and can be deleted under **all** options: checkpoint/cursor custom entries → a rewindable document; synthetic live-branch entries → pending entries and views; ad-hoc event bridging → `watch()`; in-flight operation tracking → tasks.

## Option A — Embed the engine in the Supernova server

Replace the SDK inside `packages/agent-runtime` with `pi-durable`, in-process. Browser keeps today's Effect RPC contracts.

**Pros**

- One rewrite axis: engine semantics only. Isolated to `agent-runtime`; web client untouched.
- Full feature parity: raw entry access, custom tools, resource loading, provider OAuth all stay in-process.
- Fixes today's session pain directly: paged queries and indexed lookup are first-class in the engine.
- Durable crash recovery, subagents (owned conversations), and per-frame coalesced streaming come for free.
- No exposure to protocol/transport churn.

**Cons**

- We keep owning the RPC, sync, and subscription machinery in `packages/contracts`.
- No facet/extension host, so no path to third-party extension UI without inventing delivery ourselves.
- No multi-client attachment; remote access remains entirely our problem.

## Option B1 — Chord services over our own transport

Same host as A (our server owns durable sessions in-process), but the browser consumes **Chord services and replicated state** through our existing WebSocket instead of our own RPC contracts. No pi-protocol, no pi-server.

**Pros**

- Deletes the RPC/sync machinery: Chord service subscriptions and delta-replicated documents replace hand-rolled contracts, subscription plumbing, and snapshot/update logic. `packages/contracts` shrinks to Supernova domain service definitions.
- Carries the full extension story: facets are a Chord feature, not a pi-server one — session entries, presentation bundles, and document-backed extension UI state all work.
- Keeps our transport, auth, and reconnect behavior, which already exist and are browser-appropriate.
- Only ~2 small adapters to write (Chord ⇄ WebSocket on each side); everything else is provider code shared with A and B2.

**Cons**

- We own the bridge and reconnect/fencing semantics; no prebuilt client library does it for us.
- Chord is explicitly "not a stable public API contract yet".
- Browser-side facet bundle loading is unproven (pi's loader is Node-only today; their only presentation consumer is the TUI).
- No multi-client attachment or worker isolation.

## Option B2 — Browser as a pi-client

`pi-server` owns sessions and worker processes; the browser speaks `pi-protocol` via `pi-client` (browser-safe by design, and it ships `createClientServiceTransport()`, the Chord↔protocol bridge). Our server shrinks to a gateway: TLS, browser auth, WebSocket→socket relay, static serving, process supervision, and the pre-session management API (projects, workspaces, starting hosts).

**Pros**

- Client-side glue is prebuilt: we write only a WebSocket `ByteTransportFactory`.
- Multi-client attachment done correctly — phone + laptop on one live session, with stale-route fencing on reconnect.
- Per-session worker processes: crash and runaway isolation, which matters most for untrusted extension code and multi-user remote use.
- Session lifecycle, durability across our restarts, and routing are upstream code we inherit.
- Interop: other pi clients (the CLI) can attach to Supernova sessions.

**Cons**

- Most gated on upstream: needs server/worker re-wiring to durable, a WebSocket server transport, and transport auth — none of which exist.
- Product logic splits across two deployables (gateway + host/facets); plugin packaging and versioning against Pi releases becomes permanent operational work.
- We inherit pi's session and attachment model rather than choosing our own.
- Remote provider credentials are undesigned anywhere.

**Server ownership levels (applies to B2).** `pi-server` is a library, not just pi's binary: its `ServerHost` asks the application to implement `resolveSession`/`openSession`, so the application opens sessions from its own repo and creates the engine itself. Level 1 = run pi's stock server and ship facets. Level 2 = assemble a Supernova host from `pi-server` + `pi-durable` with our own storage and engine options. **Level 2 contains Option A** — same process, same engine, same direct access, plus pi's routing. pi-server never wraps the engine; it routes opaque envelopes to endpoints we provide.

## Verdict and sequencing

**A → B1 → B2 (optional).** Each step ships independently and its work carries into the next:

- The provider objects, turns/timeline rework, checkpoint documents, tools, and hooks are identical in all three. Only the wire differs.
- **A → B1** is a wire swap: delete the adapter and today's session contracts, register the same providers as Chord services.
- **B1 → B2** is a hosting change: move the host behind pi-server, replace our bridge with `pi-client`.

**B2 is worth buying only for what it uniquely adds** — multi-client attachment, worker isolation, and pi-client interop. If Supernova sessions are only ever for Supernova, and single-process crash recovery is acceptable (durable makes a crash recoverable rather than fatal), **B1 is a legitimate final destination** and reaches the main prize — deleting the bespoke RPC/sync layer and gaining the facet extension model — without waiting on pi's unfinished transport and auth work.

To keep the A step cheap, follow the **provider discipline**: define contracts as plain interfaces with JSON-safe types only, implement them as plain provider objects closing over the engine (no Effect or RPC imports), model streaming as snapshot + ordered updates, and quarantine all Effect/RPC translation in one logic-free adapter. What gets thrown away at B1 is then that adapter alone.

## Open items regardless of option

- **Existing sessions are not readable by the new engine.** The old lane harness had a `legacy-v3` reader; `pi-durable` has no legacy import path, and the storage model differs fundamentally. No converter exists upstream, and none is on the engine's milestone plan. Decide between waiting for pi's converter, writing our own replay, keeping the old SDK read-only for archived sessions, or accepting the break.
- **Remote provider credentials / OAuth**: credentials live where the engine runs; browser login flows assume localhost callbacks. Undesigned upstream under every option.
- **Gateway responsibilities** (browser auth, TLS, relay, process supervision) and the pre-session management API are ours in every option.
- **Extension UI slots** ("composer accessory", "timeline renderer") are a Supernova API; pi has no concept of our UI regions. The neutral half of today's extension `ctx.ui` (`select`/`confirm`/`input`/`notify`/status) is implementable against the current SDK already and the React components transfer.

## Readiness signals (as of 2026-09-29)

| Gate                                | Needed for                                                  | Status                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engine milestones 1–18/20**       | A, B1, B2                                                   | ✅ Storage, documents, checkpoints, forks, watches, harness, task runtime, chat turn, tool turn + hooks, inbox/steer, subagents all landed                              |
| **M19 compaction**                  | A, B1, B2                                                   | ⏳ Next; spec'd (renamed from "collapse"). Blocks a _complete_ migration                                                                                                |
| **M20 reload + conformance**        | extension hot-reload                                        | ⏳ After M19                                                                                                                                                            |
| **Engine dogfooded**                | recommended start trigger                                   | ❌ Nothing consumes `pi-durable` yet, not even pi's own coding agent                                                                                                    |
| **Chord services (remote)**         | B1, B2                                                      | ✅ `createRemoteServiceEndpoint`, wire + state codecs exist                                                                                                             |
| **Chord symmetric RPC**             | server→client calls (approval dialogs, extension `confirm`) | ❌ Planned: goal #3 and a named layer in Chord's plan, bundled with a transport adapter API. Workaround: model requests as document state and answer via a service call |
| **Browser facet loading**           | extension UI in the web client                              | ❌ Unverified; pi's loader is Node-only                                                                                                                                 |
| **Service contracts on durable**    | B2                                                          | ❌ Today's `AgentController`/`Transcript` target the dead lane harness; part of the "new coding agent"                                                                  |
| **Server/worker wiring to durable** | B2                                                          | ❌ Same bucket                                                                                                                                                          |
| **WebSocket transport + peer auth** | B2                                                          | ❌ Unix socket only; no auth code, no design doc. The least-owned gate                                                                                                  |
| **Protocol compat guarantees**      | B2                                                          | ❌ v8, explicitly none; freezes only after pi's own consumers prove the stack                                                                                           |

**Calibration.** The engine went from design docs to 18/20 milestones in ~10 days; packages 13–18 landed in roughly 24 hours. Announced dates slip (a claimed "harness Friday" passed without a release), and the architecture was reset once mid-stream (lane harness → pico) — but every iteration has moved _toward_ Supernova's needs: paged queries, rewindable state, durable approvals, frame-coalesced streaming. Track progress via the status line in `packages/durable/docs/pico-v5-handoff.md` and `packages/chord/PLANNING.md`; watch for a milestone plan appearing for the server/transport layer, which is what would make B2 estimable.
