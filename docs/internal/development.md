# Development

## Setup and commands

Use Bun 1.3.13, Node 22.19 or newer (`mise.toml`), and Git. Bun installs packages, runs scripts, and bundles; the server itself always runs on Node. Run commands from the repository root; Turborepo owns workspace orchestration. Don't mix npm, Yarn, or pnpm into the workflow unless external tooling requires it.

```sh
bun install
bun run dev:desktop  # Electron with a local API
bun run dev:server   # Local API and Vite browser UI
bun run build
```

## Verification

Choose checks that prove the changed behavior. Start with affected tests and broaden for shared boundaries or cross-package changes. Fix regressions introduced by the task, rerun affected checks, and report unrelated failures separately.

Root verification commands:

```sh
bun run test
bun run typecheck
bun run lint
bun run prettier
```

`bun run prettier` checks workspace code and scripts; it does not cover root Markdown or `docs/`. For documentation changes, check changed Markdown with the installed formatter from the repository root:

```sh
bun x --no-install prettier --check AGENTS.md README.md 'docs/**/*.md'
```

Check local links and references after moving documents. Documentation-only edits do not require runtime tests unless they change executable examples or release procedures.

Test observable behavior and meaningful failure paths rather than trivial rendering or implementation details. Use isolated fixtures, prefer real in-memory dependencies and narrow replacements at external boundaries, and wait on observable conditions rather than arbitrary sleeps. Clean up processes and resources you start; do not treat live user data as test fixtures.

Package-specific test scope and placement live in [Web](web.md#testing) and [Agent runtime](agent-runtime.md#testing).
