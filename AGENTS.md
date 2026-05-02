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
apps/web       → React UI (primary development surface)
apps/desktop   → Electron wrapper (runtime + OS integration)

packages/pi-runtime  → Pi SDK integration (Node-only)
```

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
