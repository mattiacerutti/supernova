<p align="center">
  <img src="packages/web/assets/icon.png" alt="Supernova logo" width="80" />
</p>

<h1 align="center">Supernova</h1>

<p align="center">
  <a href="https://github.com/mattiacerutti/supernova/actions/workflows/ci.yml"><img src="https://github.com/mattiacerutti/supernova/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mattiacerutti/supernova/stargazers"><img src="https://img.shields.io/github/stars/mattiacerutti/supernova?style=flat&logo=github" alt="GitHub stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
</p>

<p align="center">
  The fast, opinionated development environment for the <a href="https://github.com/earendil-works/pi">Pi coding agent</a>.
</p>

<p align="center">
  <img src="docs/assets/supernova-desktop.png" alt="Supernova desktop workspace" width="100%" />
</p>

> [!WARNING]
> Supernova is pre-release software. Expect breaking changes and rough edges.

Supernova is built for developers who want to move quickly without giving up control.

- **Performance first** — A virtualized timeline and streaming UI stay responsive, even in long sessions.
- **Sleek by design** — A calm, focused interface without the feature sprawl of a general-purpose agent environment.
- **Pi, not a replacement** — Pi remains the execution engine for models, providers, credentials, sessions, and tools.
- **Git-backed navigation** — Move across conversation checkpoints and restore turn-level workspace changes without moving `HEAD` or resetting staged work.
- **Remote-first** — Supernova is designed to run agents where the code lives and control them from anywhere. Remote access is coming soon.

## Install

Download the desktop app for macOS, Linux, or Windows from [GitHub Releases](https://github.com/mattiacerutti/supernova/releases).

> [!NOTE]
> Current macOS builds are unsigned. If macOS blocks Supernova, move it to Applications and run:
>
> ```bash
> xattr -rd com.apple.quarantine /Applications/Supernova.app
> ```

### From source

Requires [Bun](https://bun.sh) 1.3.13 and Git.

```bash
git clone https://github.com/mattiacerutti/supernova.git
cd supernova
bun install
bun run dev:desktop
```

This starts the web client, server, and Electron app. To use Supernova in a browser instead:

```bash
bun run dev:server
```

The development server runs at `http://localhost:5173`.

## Development

```bash
bun run build
bun run lint
bun run typecheck
bun run test
bun run test:e2e
```

Supernova is a Bun/Turborepo workspace:

- `apps/server` — CLI, server, Pi runtime composition, and host capabilities
- `apps/desktop` — Electron shell
- `packages/web` — React browser client
- `packages/agent-runtime` — Pi SDK integration and runtime services
- `packages/contracts` — shared RPC contracts

For architecture and development guidance, see [`docs/`](docs/).

## License

[MIT](LICENSE)
