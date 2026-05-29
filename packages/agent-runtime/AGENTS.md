# agent-runtime Package Guidance

## Purpose

`packages/agent-runtime` owns thes runtime integration layer for Supernova. It provides Effect services and live implementations for provider SDKs, filesystem/runtime boundaries, sessions, streams, and related execution concerns.

This package should stay focused on runtime behavior and provider integration. Shared serializable contracts belong in `@supernova/contracts`, and UI or server routing concerns belong outside this package.

## Source Layout

- Keep public Effect service tags and service interfaces in `src/services/<domain>`.
- Keep runtime/provider-specific implementations in `src/implementations/<runtime>/<domain>`.
- Use examples like `src/implementations/pi/sessions` and `src/implementations/filesystem/folders` as the intended shape.
- Keep public live layer files named `*-live.ts`.
- Keep `*-live.ts` files focused on wiring service methods to implementation functions.
- Put service operation implementations in an `operations` folder when a service has multiple non-trivial methods.
- Put pure implementation-local mappers, resolvers, builders, and helpers in `lib` when they are shared by multiple operations.
- Put private implementation-local Effect services and layers in `internal`.
- Do not put private implementation-local services under top-level `src/services`.
- Keep serializable domain contracts, schemas, and RPC definitions in `@supernova/contracts`; do not duplicate them in this package.

## Service Design

- Keep live layer files thin; they should primarily wire services to implementation functions.
- Put each service operation implementation in its own file when a service grows beyond simple wiring.
- Use `operations` as the folder name for service operation implementations.
- Design for testability by introducing narrow, app-owned Effect services at meaningful runtime boundaries.
- Prefer narrow capability services over broad gateway objects or raw third-party SDK dependencies.
- Operations should depend only on the capabilities they actually need.
- Name internal services by capability, not architecture vocabulary.
- Keep pure logic in `lib`.
- Use internal services only for boundaries that need production/test replacement, resource ownership, or runtime integration.
- Treat internal boundaries as tools for testability and runtime ownership, not as a way to hide the chosen runtime from its own implementation.
- Runtime-specific operations may directly orchestrate runtime objects and map runtime types when that remains readable and testable.
- Small private internal services may keep their service tag, shape, and production `Live` layer in the same file.

## Code Standards

- Use package imports for source imports that must typecheck from dependent packages, such as `@supernova/agent-runtime/...`.
- Avoid interfaces for local-only callback or object shapes unless they clarify a reused boundary or TypeScript requires them.
- Avoid helper functions for trivial one-liners; inline simple logic when that is more readable.
- Avoid defensive overchecking when the operation boundary already guarantees the state.

## Testing

- Keep test folders aligned with the implementation boundaries under `src` unless the user explicitly requests a different organization. For example, tests for `src/implementations/pi/session-runtime` should live under `tests/implementations/pi/session-runtime`, and tests for shared Pi code should live under `tests/implementations/pi/shared`.
- Add tests for critical paths, new behavior, bug fixes, and failure handling that could regress user-visible runtime behavior.
- Test behavior and observable outcomes, not implementation details or whether code lines executed.
- Prefer focused tests around operation boundaries, mapping logic, error handling, and stream/session lifecycle behavior.
- Avoid overtesting trivial wiring, passthrough live layers, and private helpers that are already covered through higher-level behavior tests.
- If tests require excessive mocking, brittle setup, or awkward access to internals, treat that as a code smell.
- Prefer improving implementation boundaries and dependencies when behavior is hard to test cleanly.
- Prefer real in-memory dependencies, faux providers, and narrow Effect service replacements over giant mocks that recreate SDK internals.
- Do not assert that internal services were called unless the call itself is user-visible behavior.
- Assert outputs, persisted state, emitted events, cleanup, and errors instead.
