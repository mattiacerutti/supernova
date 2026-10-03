# Architecture

Supernova uses the Pi SDK (`@earendil-works/pi-coding-agent`) as its execution engine. Product direction lives in [Product](product.md); this guide defines ownership across packages.

## Package boundaries

- `apps/server` is the authority for native capabilities: Pi runtime composition, workspace filesystem access, subprocesses, shell/Git, credentials, sessions, and API/WebSocket routing. It never hosts or bundles the UI.
- `packages/agent-runtime` provides the Node-only runtime: feature modules over the Pi SDK, composed once by the server. Keep UI and server routing outside this package. See [Agent runtime](agent-runtime.md).
- `packages/web` is an independently hosted React/Vite client. It communicates through server APIs and cannot assume browser-local filesystem or native access. See [Web](web.md).
- `packages/contracts` defines shared Effect schemas, RPC boundaries, the session service contracts, and serializable domain types. It owns no runtime resources and remains environment-neutral. See [Contracts](contracts.md).
- `apps/desktop` owns the Electron shell, bundled renderer asset loading, and OS integration. It starts a local API child rather than owning Pi runtime logic.

Bun manages packages and scripts; Turborepo coordinates workspace tasks. The server runs on Node. Two transports share the server's port:

- **Sessions** (`/pi`): lifecycle, commands, and each session's state are Chord services over Pi's service protocol (`@earendil-works/pi-server` and `pi-client`), the protocol Pi's own remote clients use. Session state is Chord replicated state, so clients receive each change as a delta.
- **Everything else** (`/ws`): projects, workspace, terminals, folders, providers, extensions, configuration, and the composer's models and suggestions are Effect RPC over the contract schemas.

Runtime code is plain TypeScript behind both edges. Chord's extension facets (plugin UI in the client) are not used yet; serving sessions as Chord services is what they would build on.

## Runtime modes

```text
Standalone server:
terminal → supernova-server → runtime/filesystem/workspaces (no UI)

Development (turbo run dev):
API on 127.0.0.1:4317 (bun --watch) + Vite UI host on 127.0.0.1:48371
browser or Electron → Vite UI; WebSocket via the UI host's proxy (browser) or directly (Electron) → API

Desktop:
Electron → bundled API on an OS-assigned port
BrowserWindow → supernova://app → API endpoint supplied by preload
```

UI hosting and API ownership are separate. Remote/LAN operations happen on the machine running `apps/server`, not the machine running the browser. New features must preserve that boundary even when developed locally.

### Native modules in the server

The server runs under Bun in development and under Electron's Node in the desktop app. Code that needs a native capability checks for the Bun API first and falls back to a native module for Node; `features/workspace/terminals/pty.ts` does this with `Bun.Terminal` and `@lydell/node-pty`. Such a module is marked `--external` in the server build and `scripts/prepare-tools.ts` copies it, with only the current platform's prebuilt binary, to `dist/node_modules`, which electron-builder ships next to `cli.js`.

For execution and recovery guarantees, see [Session runtime](session-runtime.md). For workspace snapshot and restore guarantees, see [Checkpoint system](checkpoint-system.md).
