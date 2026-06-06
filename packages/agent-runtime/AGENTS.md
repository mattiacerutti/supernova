# agent-runtime Package Guidance

## Purpose

`packages/agent-runtime` owns thes runtime integration layer for Supernova. It provides Effect services and live layers for provider SDKs, filesystem/runtime boundaries, sessions, streams, and related execution concerns.

This package should stay focused on runtime behavior and provider integration. Shared serializable contracts belong in `@supernova/contracts`, and UI or server routing concerns belong outside this package.

## Source Layout

- Keep public Effect service tags and service interfaces as flat files in `src/services`.
- Keep concrete runtime/provider wiring and operation layers in `src/layers/<domain>`.
- Put cross-layer implementation code in `src/layers/shared`, using `lib` for pure helpers and `internal` for private Effect services or layers shared by multiple layer domains.
- Use examples like `src/layers/sessions`, `src/layers/session-runtime`, and `src/layers/folders` as the intended shape.
- Keep public live layer files named `*-live.ts`.
- Keep `*-live.ts` files focused on wiring service methods to implementation functions.
- Put service operation implementations in an `operations` folder.
- Put pure implementation-local mappers, resolvers, builders, and helpers in `lib` when they are shared by multiple operations or when the operation becomes too long and unreadable.
- Put private implementation-local Effect services and layers in `internal`.
- Keep serializable domain contracts, schemas, and RPC definitions in `@supernova/contracts`; do not duplicate them in this package.

## Service Design

- Keep live layer files thin; they should primarily wire services to implementation functions.
- Put each service operation implementation in its own file.
- Design for testability by introducing narrow, app-owned Effect services at meaningful runtime boundaries.
- Prefer narrow capability services over broad gateway objects or raw third-party SDK dependencies.
- Operations should depend only on the capabilities they actually need.
- Name internal services by capability, not architecture vocabulary.
- Use internal services only for boundaries that need production/test replacement, resource ownership, or runtime integration.
- Treat internal boundaries as tools for testability and runtime ownership, not as a way to hide the chosen runtime from its own implementation.
- Runtime-specific operations may directly orchestrate runtime objects and map runtime types when that remains readable and testable.
- Small private internal services may keep their service tag, shape, and production `Live` layer in the same file.

## Code Standards

- Use package imports for source imports that must typecheck from dependent packages, such as `@supernova/agent-runtime/...`.
- Avoid interfaces for local-only callback or object shapes unless they clarify a reused boundary or TypeScript requires them.
- Avoid defensive overchecking when the operation boundary already guarantees the state.

## Testing

Use the `writing-good-tests` skill when writing or reviewing tests.

- Keep test folders aligned with layer boundaries under `src`, split by test category. For example, unit tests for `src/layers/session-runtime` should live under `tests/unit/layers/session-runtime`, and integration tests for `src/layers/folders` should live under `tests/integration/layers/folders`.
- Add tests for critical runtime behavior, bug fixes, failure handling, stream/session lifecycle behavior, persistence, emitted events, and cleanup.
- Prefer focused tests around operation boundaries, mapping logic, error handling, and runtime lifecycle behavior.
- Prefer real in-memory dependencies, faux providers, and narrow Effect service replacements over broad SDK mocks.
