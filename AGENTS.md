# Supernova

Supernova is an opinionated development environment built on Pi. The Pi SDK owns agent execution; we build the desktop and browser experience, session workflows, and recovery around it.

## What we care about

- **Speed is a feature.** Long sessions, rapid streams, and dense timelines should stay responsive. Consider rendering, network, and runtime costs, not only the empty-screen experience.
- **Correctness before convenience.** Keep behavior predictable through reconnects, session restarts, and partial streams. A simpler implementation is not a win if it loses work or hides failure.
- **Polish is part of the work.** Loading states, keyboard interaction, scrolling, spacing, and transitions belong to the feature, not a later cleanup pass.
- **Remote by design.** The server owns execution, credentials, and workspace access. Paths refer to the server's machine. Desktop is a shell, not a second runtime.

## How to work

Understand the constraint, then choose the smallest change that makes the correct behavior clear. We want simple systems, not machinery that looks impressive.

### Think before coding

- State assumptions that affect the result. If multiple interpretations would lead to different implementations, lay them out rather than silently choosing one.
- Name uncertainty. When an ambiguity changes scope, behavior, or safety, ask before proceeding; don't code around something you haven't understood.
- Surface tradeoffs and point out simpler approaches. Push back when the requested approach adds complexity without solving a real constraint.
- Understand the actual flow before choosing a shortcut. For bugs, inspect callers and sibling paths, then fix the root cause at the shared boundary rather than patching only the reported symptom.

### Simplicity first

After understanding the problem, stop at the first option that meets the requirements:

1. **Does this need to exist?** Skip speculative work; explain what concrete need would justify it.
2. **Does the codebase already solve it?** Look for existing helpers, types, components, and patterns before writing replacements.
3. **Does the standard library or platform cover it?** Prefer built-in behavior over custom machinery: CSS over JavaScript layout logic, native capabilities over a new dependency, while preserving the app's design and accessibility conventions.
4. **Does an installed dependency solve it?** Use it before adding another. Don't add a dependency for something a few clear lines can do.
5. **Only then, write custom code.** Keep it as small and direct as correctness and readability allow.

- No speculative features, configurability, or scaffolding for later. Extract shared behavior for real duplication, not hypothetical future callers. Avoid single-use factories and interfaces that add no meaningful boundary.
- Prefer removing unnecessary machinery over adding another layer. Keep the diff and number of files small, but don't compress code into clever one-liners or bypass established ownership boundaries.
- Handle real failure modes, not impossible scenarios already ruled out by the boundary. Don't preserve backward compatibility unless requested.
- Never simplify away trust-boundary validation, protection against data loss, security, accessibility, or explicitly requested behavior. Among equally simple options, choose the one that handles real edge cases correctly.
- When a deliberate simplification has a known limit, document that limit and the condition for revisiting it near the code. Obvious code needs no comment defending its simplicity.
- Review the result for unnecessary machinery. If a substantially smaller implementation would be equally clear and correct, simplify it before calling the work done.

### Surgical changes

- Read enough surrounding code to understand the change; read files fully for audits and broad rewrites. Match existing style and conventions.
- Don't improve adjacent code, comments, or formatting just because you're there. Refactor only where the requested change needs it.
- Remove imports, variables, functions, and other code that your changes make unused. Flag unrelated dead code rather than deleting it.
- Every changed line should serve the requested outcome. Ask before removing intentional functionality outside the agreed scope.

### Goal-driven execution

- Turn the request into observable success criteria before implementing. “Make it work” is not a verification plan.
- For a bug fix, reproduce the failure with a focused regression test, then make it pass. For validation, cover invalid inputs and the expected failures. For a refactor, verify that behavior is preserved before and after.
- For multi-step work, give a short plan pairing each step with how you'll verify it. Keep routine, trivial edits lightweight.
- Run relevant checks, fix failures caused by your changes, and repeat until the success criteria are met or you're genuinely blocked. Don't stop at the first implementation when verification is part of the task.
- Report what you checked and what remains unverified. Scale verification to the risk; a typo fix does not need a full test run.

### Working boundaries

Don't overwrite unrelated work or use live sessions, credentials, or workspace state as disposable test fixtures. Ask before destructive actions or restarting processes you didn't start. If a task conflicts with repository guidance, call out the conflict and get confirmation before overriding it.

## Where code lives

| Path                     | Owns                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `apps/server`            | Headless Node API, CLI, runtime composition, HTTP/WebSocket routing. Never hosts or bundles the UI. |
| `apps/desktop`           | Electron shell, bundled renderer loading, local API child, OS integration.                          |
| `packages/web`           | React/Vite client. No native or filesystem assumptions.                                             |
| `packages/agent-runtime` | Node-only Pi integration: feature modules, the session runtime, and service composition.            |
| `packages/contracts`     | Environment-neutral Zod schemas, Chord service contracts, and serializable domain types.            |

Use Bun for dependencies and scripts, TypeScript for code, and workspace packages for shared boundaries. Run verification commands from the repository root; this is a Turborepo workspace.

## Read what the task needs

This is the repository's only `AGENTS.md`. Shared and area-specific conventions live in `docs/internal/`; don't add nested instruction files. Read the relevant guide when working in its area, not the whole table before every edit.

| When working on…                                               | Read                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| Product direction and feature tradeoffs                        | [Product](docs/internal/product.md)                     |
| Package boundaries, runtime ownership, desktop/browser hosting | [Architecture](docs/internal/architecture.md)           |
| TypeScript implementation and code organization                | [Coding standards](docs/internal/coding-standards.md)   |
| React UI, styling, client state, runtime hooks                 | [Web](docs/internal/web.md)                             |
| Runtime features, Pi integration, backend organization         | [Agent runtime](docs/internal/agent-runtime.md)         |
| Shared schemas, service payloads, errors, exports              | [Contracts](docs/internal/contracts.md)                 |
| Sessions, streaming, reconnects, committed/live state          | [Session runtime](docs/internal/session-runtime.md)     |
| Checkpoint capture, restore, Git preservation                  | [Checkpoint system](docs/internal/checkpoint-system.md) |
| Local setup, verification, test conventions                    | [Development](docs/internal/development.md)             |
| Desktop icon assets and generation                             | [Icons](docs/internal/icons.md)                         |
| Changelog entries and publishing releases                      | [Release](docs/internal/release.md)                     |
| Writing or reorganizing documentation                          | [Documentation](docs/internal/documentation.md)         |

When comparing other projects or checking upstream patterns, look in `.context/` first. Available references include `.context/pi`, `.context/effect-smol`, and `.context/effect-solutions`; inspect the directory rather than assuming a mirror exists.

## Documentation

`docs/` contains guides for people **using** Supernova. `docs/internal/` contains conventions, architectural decisions, and procedures for people and agents **building** it.

Keep one home for each subject and link to it elsewhere. Update the section that became inaccurate rather than appending a work log. Document constraints and reasoning the code cannot explain; don't maintain a prose copy of the implementation.

Add changelog entries for user-facing, release-relevant changes under `## [Unreleased]` in `CHANGELOG.md`. Internal refactors, tests, and documentation-only changes don't need entries unless they affect released behavior or release operations.
