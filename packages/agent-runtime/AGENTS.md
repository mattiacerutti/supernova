# agent-runtime package agents.md

## File structure

- Keep service contracts in `src/services/<domain>`.
- Keep provider-specific implementations in `src/providers/<provider>/<domain>`.
- Keep live layer files named `*-live.ts` and focused on wiring service methods to implementation functions.
- Keep service operation implementations in an `operations` folder when a service has multiple non-trivial methods.
- Keep shared state or provider runtime setup in a small runtime module next to the operations that use it.

## Service implementations

- Keep live layer files thin; they should primarily wire services to implementation functions.
- Put each service operation implementation in its own file when a service grows beyond simple wiring.
- Use `operations` as the folder name for service operation implementations.
- Keep shared runtime state/helpers in a small shared runtime module only when multiple operations need them.

## Code standards

- Avoid interfaces for local-only callback/object shapes unless they clarify a reused boundary or TypeScript requires them.
- Avoid helper functions for trivial one-liners; inline simple logic when readability improves.
- Avoid defensive overchecking when the operation boundary already guarantees the state.

## Imports

- Use package imports for source imports that must work from dependent packages, e.g. `@pi-desktop/agent-runtime/...`.
