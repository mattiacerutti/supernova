# Contracts

Conventions for `packages/contracts`. See [Coding standards](coding-standards.md) for shared TypeScript rules.

## Contract structure

- Keep each domain under `src/services/<domain>`, one per agent-runtime feature and named after it. `src` holds nothing else but `lib`.
- Keep what every domain shares in `src/lib`, which is not a domain: `lib/protocol.ts` (`json<T>()`, the host kinds, `RuntimePrincipal`, the socket path), `lib/errors.ts` (`TaggedError`, `errorUnion`, `Errors`, `failureOf`), and `lib/desktop.ts` (the API the desktop preload exposes to the renderer). Import it as `@supernova/contracts/lib/<file>`.
- Keep reusable domain schemas under `src/services/<domain>/schemas`.
- Keep payload, result, and error definitions of each operation under `src/services/<domain>/procedures`.
- Keep Chord remote contracts in `src/services/<domain>/services.ts`: one per agent-runtime feature, named after it (`SessionsService` for `features/sessions`), plus one for each thing a feature serves one object of (`TerminalService`, one per terminal, beside `WorkspaceService`), with members named after the feature class's methods. The folder mirrors the feature: terminals live under `workspace/` as they do in `features/workspace/terminals`. Methods take a procedure payload (`undefined` when there is none) and return their result, or throw; state that changes over time is a state member.
- Every remote contract's name ends in `Service`. Wire names stay short (`supernova.chat`) and never change for a rename.
- Each contract names its host: `serverHost` for objects of the server, `sessionHost` for objects of one session's host (`ChatService`). Its params identify the object: `{}` for one the server offers once, an id for one per something (`{terminalId}`), and payloads leave it out.
- Each contract declares one variant per principal kind that may hold it: `owner` for browsers, `server` for the server's own workflows (`ChatService`'s), `worker` for session hosts reporting about their own session. Chord keeps one signature per method name across a contract's variants, so variants name differing methods differently. Export the held type of a variant clients use as `XOwner = Extract<Reference<typeof X>, {variant: "owner"}>`.
- A method's payload is its procedure schema: Chord checks every call's arguments against it before the provider runs, and refuses a bad one as `invalid/args`. Results are `nul()` for none and `json<T>()` otherwise, and so is state: typed, but unchecked, as Chord checks only arguments. Payloads leave out what the contract's params already say (`sessionId` for `ChatService`, `id` for `TerminalService`). Contracts are versioned by Chord: a breaking change to a member, payloads included, bumps the contract's `version`.

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
- Schemas use Chord's builders from `@earendil-works/chord` (`obj`, `arr`, `map`, `union`, `oneOf`, `lit`, `opt`): argument objects must be closed, and records are `map`. A value Pi owns is `json<PiType>()`: Pi defines its shape, so it is carried unchecked. Export each schema and its `Static` type under the same name.
- Procedure files expose named payload, result, and error definitions.

## Errors

- Define errors that cross the boundary with `TaggedError("Tag")` from `lib/errors`: a Chord `PluginError` whose `code` is the tag, so Chord carries it over the link as it is, with its message. Declare only errors a client branches on. Features throw a plain `Error` for everything else; Chord sends it with code `internal` and its message. The cause never crosses: the facet edge logs it.
- A service lists what its methods may fail with next to its contract, by method name: `export const ChatErrors = {undoCheckpoint: CheckpointNavigationError} satisfies Errors<typeof ChatService>;`. A key the service has no method of fails to compile. Several errors are one value, `export const X = errorUnion(A, B)`, next to their payload. A client reads a failure's code with `failureOf(cause, ChatErrors.undoCheckpoint)`, typed as that method's codes and checked at runtime: any other failure gives `undefined`. `CodeOf<typeof ChatErrors.undoCheckpoint>` names them as a type.
- Use distinct tagged errors for distinct procedures unless there is a deliberate shared failure domain.
- Keep error tags stable and descriptive, for example `AgentSessionCreateError`.

## Environment

- Keep contracts environment-neutral and serializable. Pi types are imported type-only; Chord's `remote` and `method` only build contract values.
- Do not add runtime ownership logic, filesystem access, subprocess access, or provider SDK logic here.
