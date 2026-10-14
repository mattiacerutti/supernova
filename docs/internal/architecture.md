# Architecture

Supernova uses the Pi SDK (`@earendil-works/pi-coding-agent`) as its execution engine. Product direction lives in [Product](product.md); this guide defines ownership across packages.

## Package boundaries

- `apps/server` is the authority for native capabilities: Pi runtime composition, workspace filesystem access, subprocesses, shell/Git, credentials, sessions, and API/WebSocket routing. It never hosts or bundles the UI.
- `packages/agent-runtime` provides the Node-only runtime: feature modules over the Pi SDK, composed once by the server. Keep UI and server routing outside this package. See [Agent runtime](agent-runtime.md).
- `packages/web` is an independently hosted React/Vite client. It communicates through server APIs and cannot assume browser-local filesystem or native access. See [Web](web.md).
- `packages/contracts` defines shared Zod schemas, the Chord remote contracts, and serializable domain types. It owns no runtime resources and remains environment-neutral. See [Contracts](contracts.md).
- `apps/desktop` owns the Electron shell, bundled renderer asset loading, and OS integration. It starts a local API child rather than owning Pi runtime logic.

Bun manages packages and scripts; Turborepo coordinates workspace tasks. The server runs on Node.

Clients talk to the runtime only through Chord (`@earendil-works/chord`): the server is a Chord host named `server` that serves one remote object per agent-runtime feature, and the browser is a Chord client host linked to it over the `/ws` WebSocket. Each feature's contract is in the contracts folder of the same name (`features/workspace` is `WorkspaceService` in `contracts/src/services/workspace/services.ts`), with members named after the feature's methods: methods for commands and reads, state members for anything that changes over time (session documents and activity, terminal output, provider logins), which reach clients as a snapshot and then deltas. `SessionRuntimeService` is one object per session and `TerminalService` one per terminal, each addressed by its id; every other service is one object all clients share. A client holds a terminal only while a tab shows it, so terminal output reaches only those clients. The socket has no authentication: every client acts as the owner, so the server must only be reachable by its owner. The server's only other route is `GET /health`. Runtime code is plain TypeScript; there is no Effect.

## Runtime modes

```text
Standalone server:
terminal → supernova-server → runtime/filesystem/workspaces (no UI)

Development (turbo run dev):
API on 127.0.0.1:4317 (tsx watch, on Node) + Vite UI host on 127.0.0.1:48371
browser or Electron → Vite UI; WebSocket via the UI host's proxy (browser) or directly (Electron) → API

Desktop:
Electron → bundled API on an OS-assigned port
BrowserWindow → supernova://app → API endpoint supplied by preload
```

UI hosting and API ownership are separate. Remote/LAN operations happen on the machine running `apps/server`, not the machine running the browser. New features must preserve that boundary even when developed locally.

### Server runtime

The server runs on Node everywhere: `tsx watch` runs the source in development, the packaged server runs the bundle with Node, and the desktop app with Electron's Node. Bun is the package manager, script runner, and bundler, not a runtime for the server, so runtime code uses Node's APIs directly: `node:sqlite` (through pi-durable's `openNodeSqliteStorage` for session files) and `@lydell/node-pty` for terminals. Don't add Bun-only APIs or runtime switches.

`@lydell/node-pty` is a native module, so it is marked `--external` in the server build and `scripts/prepare-tools.ts` copies it, with only the current platform's prebuilt binaries, to `dist/node_modules`, which electron-builder ships next to `cli.js`.

For execution and recovery guarantees, see [Session runtime](session-runtime.md). For workspace snapshot and restore guarantees, see [Checkpoint system](checkpoint-system.md).
