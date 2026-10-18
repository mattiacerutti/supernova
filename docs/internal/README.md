# Internal documentation

Guidance for developers and coding agents building Supernova. User guides live in [docs](../README.md).

## Product and architecture

- [Product](product.md) — audience, direction, and product tradeoffs.
- [Architecture](architecture.md) — package boundaries, runtime ownership, and hosting modes.
- [Session runtime](session-runtime.md) — durable session state, streaming, concurrency, and recovery.
- [Checkpoint system](checkpoint-system.md) — capture, restore, persistence, and Git preservation.

## Implementation conventions

- [Coding standards](coding-standards.md) — TypeScript, imports, and implementation layout.
- [Web](web.md) — React, feature structure, styling, state, and RPC hooks.
- [Agent runtime](agent-runtime.md) — feature structure, dependency boundaries, and state ownership.
- [Contracts](contracts.md) — schema organization, RPC errors, and public exports.

## Working on the project

- [Development](development.md) — setup, commands, and verification.
- [Testing](testing.md) — which layer a test belongs in, how many a change needs, and when to run each suite.
- [Icons](icons.md) — desktop icon sources, variants, and generation.
- [Release](release.md) — changelog conventions and publishing procedures.
- [Documentation](documentation.md) — audience, placement, maintenance, and writing style.

[AGENTS.md](../../AGENTS.md) is the single agent entry point. Read the guides relevant to your task; this index is not a mandatory reading list.
