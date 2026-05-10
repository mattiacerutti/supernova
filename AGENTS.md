# agents.md

## Purpose

This project (`pi-desktop`) is a desktop GUI for interacting with a Pi-based coding agent.

The goal is to build a **custom, opinionated user interface** for agent-driven coding workflows without reimplementing the agent itself.

The Pi SDK is used as the execution engine (https://pi.dev/docs). This repository focuses on:

- UI/UX
- interaction model
- feature layer (todos, planning, subagents, etc.)

## High-Level Architecture

```text
apps/server    → Node server + user-facing CLI. Owns Pi runtime, workspace access, HTTP/WebSocket APIs, and serves the web client.
apps/desktop   → Electron shell. Starts/embeds the server and loads the server URL.

packages/web            → React/Vite client bundle consumed by the server. No native/filesystem assumptions.
packages/agent-runtime  → Agent runtime services and provider SDK integrations (Node-only), consumed by the server.
packages/contracts      → Shared Effect schemas, RPC definitions, and domain contracts used by server and web.
```

### Runtime Model

```text
Standalone server:
user terminal → pi-desktop-server → server owns runtime/filesystem/workspaces → browser connects to server URL

Desktop app:
Electron app → spawns bundled server → server owns runtime/filesystem/workspaces → BrowserWindow loads server URL
```

- The **server process** is the authority for native capabilities: Pi runtime, workspace filesystem access, subprocesses, shell/git, credentials, sessions, and API/WebSocket routing.
- The **web package** is a pure client UI. It must communicate with server APIs and must not assume browser-local filesystem/native access.
- The **contracts package** defines shared API/RPC boundaries and serializable domain types. Keep it environment-neutral and free of runtime ownership logic.
- The **desktop app** is a convenience shell and OS integration layer. It should not own web serving or Pi runtime logic.
- Remote/LAN browser access means operations happen on the machine running `apps/server`, not the machine running the browser.

## Tech Stack

```text
Runtime:
- Bun (package manager, scripts, workspace)

Monorepo:
- Turborepo

Frontend:
- React
- TypeScript
- Vite

Desktop:
- Electron

Agent:
- @mariozechner/pi-coding-agent

Architecture:
- Effect (for services / runtime composition)
```

### Rules

- Use **Bun** for all package management and scripts (`bun install`, `bun run`)
- Do not mix npm/yarn/pnpm unless strictly required by external tooling
- Use **workspace packages** (`apps/*`, `packages/*`)
- Prefer **TypeScript everywhere**
- Always run verification commands from the repository root because this is a Turborepo workspace:
  - `bun run test`
  - `bun run typecheck`
  - `bun run lint`

## Reference Repositories

Additional repositories may be cloned under `.context/` to provide local context. When a user asks how other projects solve a problem, implement a pattern, or structure similar functionality, check `.context/` first before looking elsewhere.

Known useful references include:

- `.context/effect` for Effect examples, internals, and idioms.
- `.context/pi-mono` for Pi SDK and related monorepo patterns.

Other repositories may also be present in `.context/`; inspect the directory when broader examples or prior art would help.

## Code Standards

- Favor readability over micro-optimizations: straightforward control flow, early returns, and clear naming. Extract constants for magic numbers/strings and keep inline styles minimal (lean on classes or computed style helpers).
- Use `import type` for types; keep strings double-quoted and favor `const` over `let`.
- Use kebab-case for files and folders.

### Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

### Typing

- TypeScript is strict. Prefer `interface` for object shapes and prefix with `I` (e.g., `IComponentProps`, `IFunctionState`). Reach for `type` only when you need unions/intersections or literal unions, and do not prefix with neither `I` or `T` in that case.

### Imports and logging

- Prefer package or path aliases (`@/...`, `@assets/...`, `@pi-desktop/...`) over deep relative imports. Never use relative path imports (`./...` or `../...`).
- Follow package-specific import guidance when it is more precise, such as using `@pi-desktop/agent-runtime/...` for source imports that must typecheck from dependent packages.
- Never include TypeScript file extensions in imports (`.ts` or `.tsx`).
- Do not create local `index.ts` barrel files.
- Keep logging minimal and purposeful; remove noisy debug output when not needed.
