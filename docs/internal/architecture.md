# Architecture

Supernova uses Pi's durable engine (`@earendil-works/pi-durable`) for execution and the coding-agent SDK for resource loading, settings, and model/auth support. Product direction lives in [Product](product.md); this guide defines ownership across packages.

## Package boundaries

- `apps/server` is the authority for native capabilities: Pi runtime composition, workspace filesystem access, subprocesses, shell/Git, credentials, sessions, and API/WebSocket routing. It never hosts or bundles the UI.
- `packages/agent-runtime` provides the Node-only runtime: feature modules over the Pi SDK, composed once by the server. Keep UI and server routing outside this package. See [Agent runtime](agent-runtime.md).
- `packages/web` is an independently hosted React/Vite client. It communicates through server APIs and cannot assume browser-local filesystem or native access. See [Web](web.md).
- `packages/contracts` defines shared Zod schemas, the Chord remote contracts, and serializable domain types. It owns no runtime resources and remains environment-neutral. See [Contracts](contracts.md).
- `apps/desktop` owns the Electron shell, bundled renderer asset loading, and OS integration. It starts a local API child rather than owning Pi runtime logic.

Bun manages packages and scripts; Turborepo coordinates workspace tasks. The server runs on Node.

Clients talk to the runtime through Chord (`@earendil-works/chord`) over WebSocket. Feature contracts expose commands and reads as methods, and changing state as subscriptions that start with a snapshot and continue with deltas. Keep this remote boundary separate from feature ownership: subscriptions observe work but do not own its lifetime. See [Contracts](contracts.md) for contract conventions and [Agent runtime](agent-runtime.md) for state ownership.

The socket has no authentication: every client acts as the owner, so the server must only be reachable by its owner. Remote-capable does not mean safe to expose publicly or on an untrusted network. Runtime code is plain TypeScript; there is no Effect.

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

Native dependencies such as the PTY module must be packaged for the target platform and architecture, not merely the build host. Check the server build and desktop packaging scripts when changing them.

For execution and recovery guarantees, see [Session runtime](session-runtime.md). For workspace snapshot and restore guarantees, see [Checkpoint system](checkpoint-system.md).
