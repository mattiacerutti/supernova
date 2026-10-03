# Contracts

Conventions for `packages/contracts`. See [Coding standards](coding-standards.md) for shared TypeScript rules.

## Contract structure

- Keep each domain under `src/services/<domain>`, one per agent-runtime feature and named after it. `src` holds nothing else but `lib`.
- Keep what every domain shares in `src/lib`, which is not a domain: `lib/protocol.ts` (`ServiceResult`, the server id and socket path), `lib/errors.ts` (`TaggedError`, `errorUnion`, `GenericError`), and `lib/desktop.ts` (the API the desktop preload exposes to the renderer). Import it as `@supernova/contracts/lib/<file>`.
- Keep reusable domain schemas under `src/services/<domain>/schemas`.
- Keep payload, result, and error definitions of each operation under `src/services/<domain>/procedures`.
- Keep Chord service contracts in `src/services/<domain>/services.ts`: one service per agent-runtime feature, named after it (`SessionRuntimeService` for `features/session-runtime`), with members named after the feature class's methods. The folder mirrors the feature: terminals live under `workspace/` as they do in `features/workspace/terminals`. Methods take a procedure payload and Chord's trailing `Context` and return a `ServiceResult`; state that changes over time is a `ReplicatedState` member.

## Exports

These public contract entry points are the exception to the shared no-barrel rule.

- Add an `index.ts` barrel file in every `schemas` folder.
- Add an `index.ts` barrel file in every `procedures` folder.
- Import shared domain schemas from `@supernova/contracts/services/<domain>/schemas`.
- Import procedure contracts from `@supernova/contracts/services/<domain>/procedures`.
- Import service contracts from `@supernova/contracts/services/<domain>/services`.

## Schema organization

- In schema and procedure files, declare all exported schemas/classes first.
- Put all exported interfaces and types below the schema/class declarations.
- Schemas are plain Zod (`z.object`, `z.array`, `z.record`). A value Pi owns is `z.custom<PiType>()`: Pi defines its shape, so it is carried unchecked. Export each schema and its `z.infer` type under the same name.
- Procedure files expose named payload, result, and error definitions. The server parses every payload with its schema before calling a feature.

## Errors

- Define errors that cross the boundary with `TaggedError("Tag")` from `lib/errors`: an `Error` with a stable `_tag`. Declare only errors a client branches on. Features throw a plain `Error` for everything else; the edge sends it as a `GenericError` with its message. Never throw `GenericError` yourself: it is the edge's wire tag.
- A method declares its errors in its result type: `Promise<ServiceResult<null, CheckpointNavigationError>>`. A method with several errors names them once, as a value and a type of the same name next to its payload: `export const X = errorUnion(A, B); export type X = ErrorOf<typeof X>;`. The edge passes that same value (or the single class) as the operation's `error`. The failure's `code` is then typed as those tags plus `"GenericError"`, on the server (the provider must match) and on the client (`FailureCode<Method>`, `runtimeError<Method>(error)` in the web).
- Use distinct tagged errors for distinct procedures unless there is a deliberate shared failure domain.
- Keep error tags stable and descriptive, for example `AgentSessionCreateError`.

## Environment

- Keep contracts environment-neutral and serializable. Pi and Chord types are imported type-only, except `defineService`, which only builds a token.
- Do not add runtime ownership logic, filesystem access, subprocess access, or provider SDK logic here.
