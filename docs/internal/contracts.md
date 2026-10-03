# Contracts

Conventions for `packages/contracts`. See [Coding standards](coding-standards.md) for shared TypeScript rules.

## Contract structure

- Keep each domain under `src/<domain>`.
- Keep reusable domain schemas under `src/<domain>/schemas`.
- Keep payload, result, and error definitions of each operation under `src/<domain>/procedures`.
- Keep Chord service contracts in `src/<domain>/services.ts`: the service tokens (`defineService`) and their TypeScript interfaces. Methods take a procedure payload and Chord's trailing `Context` and return a `ServiceResult`; state that changes over time is a `ReplicatedState` member. Shared protocol pieces (`ServiceResult`, `ClientService`, the server id and socket path) are in `src/runtime/services.ts`.

## Exports

These public contract entry points are the exception to the shared no-barrel rule.

- Add an `index.ts` barrel file in every `schemas` folder.
- Add an `index.ts` barrel file in every `procedures` folder.
- Import shared domain schemas from `@supernova/contracts/<domain>/schemas`.
- Import procedure contracts from `@supernova/contracts/<domain>/procedures`.
- Import service contracts from `@supernova/contracts/<domain>/services`.

## Schema organization

- In schema and procedure files, declare all exported schemas/classes first.
- Put all exported interfaces and types below the schema/class declarations.
- Schemas are Zod. Build objects, arrays, and records with `struct`, `array`, and `record` from `runtime/schemas`, so inferred types are read-only; carry Pi-owned values with `piJson<T>()`. Export each schema and its `z.infer` type under the same name.
- Procedure files expose named payload, result, and error definitions. The server parses every payload with its schema before calling a feature.

## Errors

- Define errors that cross the boundary with `TaggedError("Tag")` from `runtime/schemas`: an `Error` with a stable `_tag`. Declare only errors a client branches on. Features throw a plain `Error` for everything else; the edge sends it as a `GenericError` with its message. Never throw `GenericError` yourself: it is the edge's wire tag.
- A method declares its errors in its result type, as classes: `Promise<ServiceResult<null, CheckpointNavigationError>>`. The failure's `code` is then typed as those tags plus `"GenericError"`, on the server (the provider must match) and on the client (`FailureCode<Method>`, `runtimeError<Method>(error)` in the web).
- Use distinct tagged errors for distinct procedures unless there is a deliberate shared failure domain.
- Keep error tags stable and descriptive, for example `AgentSessionCreateError`.

## Environment

- Keep contracts environment-neutral and serializable. Pi and Chord types are imported type-only, except `defineService`, which only builds a token.
- Do not add runtime ownership logic, filesystem access, subprocess access, or provider SDK logic here.
