# contracts package agents.md

## Contract Structure

- Keep each domain under `src/<domain>`.
- Keep reusable domain schemas under `src/<domain>/schemas`.
- Keep RPC-specific payload, result, and error schemas under `src/<domain>/procedures`.
- Keep RPC definitions in `src/<domain>/rpc.ts`.

## Exports

- Add an `index.ts` barrel file in every `schemas` folder.
- Add an `index.ts` barrel file in every `procedures` folder.
- Import shared domain schemas from `@supernova/contracts/<domain>/schemas`.
- Import RPC procedure contracts from `@supernova/contracts/<domain>/procedures`.
- Import RPC definitions from `@supernova/contracts/<domain>/rpc`.

## Schema Organization

- In schema and procedure files, declare all exported schemas/classes first.
- Put all exported interfaces and types below the schema/class declarations.
- Procedure files should expose named payload, result, and error schemas for RPC use.
- Avoid inline payload schemas inside `rpc.ts`; import the named payload schema from the procedure file instead.

## Errors

- Use `Schema.TaggedErrorClass` for RPC/domain errors that cross contract boundaries.
- Use distinct tagged errors for distinct procedures unless there is a deliberate shared failure domain.
- Keep error tags stable and descriptive, for example `AgentSessionCreateError`.

## Environment

- Keep contracts environment-neutral and serializable.
- Do not add runtime ownership logic, filesystem access, subprocess access, or provider SDK logic here.
