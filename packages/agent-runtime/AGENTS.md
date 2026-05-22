# agent-runtime package agents.md

## File structure

- Keep public Effect service tags and service interfaces in `src/services/<domain>`.
- Keep serializable domain contracts, schemas, and RPC definitions in `@supernova/contracts`; do not duplicate them in this package.
- Keep runtime/provider-specific implementations in `src/implementations/<runtime>/<domain>` such as `src/implementations/pi/sessions` or `src/implementations/filesystem/folders`.
- Keep public live layer files named `*-live.ts` and focused on wiring service methods to implementation functions.
- Keep service operation implementations in an `operations` folder when a service has multiple non-trivial methods.
- Use `lib` for pure implementation-local mappers, resolvers, builders, and helpers shared by multiple operations.
- Use `internal` for private implementation-local Effect services and layers. Do not put these under top-level `src/services`.

## Service implementations

- Keep live layer files thin; they should primarily wire services to implementation functions.
- Put each service operation implementation in its own file when a service grows beyond simple wiring.
- Use `operations` as the folder name for service operation implementations.
- Design for testability by introducing narrow, app-owned Effect services at meaningful runtime boundaries instead of broad gateway objects or raw third-party SDK dependencies.
- Operations should depend only on the capabilities they actually need. Name internal services by capability, not architecture vocabulary.
- Keep pure logic in `lib`; use internal services only for boundaries that need production/test replacement, resource ownership, or runtime integration.
- These boundaries exist for testability and runtime ownership, not to hide the chosen runtime from its own implementation. Runtime-specific operations may directly orchestrate runtime objects and map runtime types when that stays readable and testable.
- Small private internal services may keep their service tag, shape, and production `Live` layer in the same file.

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
- Prefer real in-memory dependencies, faux providers, and narrow Effect service replacements over giant mocks that recreate SDK internals.
- Do not assert that internal services were called unless the call itself is user-visible behavior. Assert outputs, persisted state, emitted events, cleanup, and errors instead.

## Imports

- Use package imports for source imports that must work from dependent packages, e.g. `@supernova/agent-runtime/...`.
