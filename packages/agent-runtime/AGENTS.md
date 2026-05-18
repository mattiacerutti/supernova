# agent-runtime package agents.md

## File structure

- Keep Effect service tags and service interfaces in `src/services/<domain>`.
- Keep serializable domain contracts, schemas, and RPC definitions in `@supernova/contracts`; do not duplicate them in this package.
- Keep runtime/provider-specific implementations in `src/implementations/<runtime>/<domain>` such as `src/implementations/pi/sessions` or `src/implementations/filesystem/folders`.
- Keep live layer files named `*-live.ts` and focused on wiring service methods to implementation functions.
- Keep service operation implementations in an `operations` folder when a service has multiple non-trivial methods.
- Keep shared state or runtime setup in a small `lib` or runtime module next to the operations that use it.

## Service implementations

- Keep live layer files thin; they should primarily wire services to implementation functions.
- Put each service operation implementation in its own file when a service grows beyond simple wiring.
- Use `operations` as the folder name for service operation implementations.
- Use `lib` for implementation-local mappers, resolvers, and helpers that are shared by multiple operations.
- Keep shared runtime state/helpers in a small shared runtime module only when multiple operations need them.

## Code standards

- Avoid interfaces for local-only callback/object shapes unless they clarify a reused boundary or TypeScript requires them.
- Avoid helper functions for trivial one-liners; inline simple logic when readability improves.
- Avoid defensive overchecking when the operation boundary already guarantees the state.

## Tests

- Add tests for critical paths, new behavior, bug fixes, and failure handling that could regress user-visible runtime behavior.
- Test behavior and observable outcomes, not implementation details or whether code lines executed.
- Prefer focused tests around operation boundaries, mapping logic, error handling, and stream/session lifecycle behavior.
- Avoid overtesting trivial wiring, passthrough live layers, and private helpers that are already covered through higher-level behavior tests.
- If tests require excessive mocking, brittle setup, or awkward access to internals, treat that as a code smell. Prefer improving the implementation boundaries and dependencies so behavior is easier to test cleanly.

## Imports

- Use package imports for source imports that must work from dependent packages, e.g. `@supernova/agent-runtime/...`.
