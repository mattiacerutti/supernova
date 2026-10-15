# Coding standards

Use these conventions for TypeScript implementation. [Web](web.md), [Agent runtime](agent-runtime.md), and [Contracts](contracts.md) own area-specific rules.

## Readable code

- Prefer straightforward control flow, early returns, and clear names over micro-optimizations.
- Extract constants for magic numbers and strings. Keep inline styles minimal; use classes or computed style helpers.
- Use `import type`, double-quoted strings, and `const` unless reassignment is needed.
- Use kebab-case for files and folders.
- Inline single-line helpers with only one call site.
- Reuse existing shared logic. Extract a module when behavior is genuinely shared, not to anticipate hypothetical reuse.

## Imports and logging

- Use package or path aliases such as `@/...`, `@assets/...`, and `@supernova/...`. Do not use relative TypeScript imports (`./` or `../`) or `.ts`/`.tsx` extensions.
- Follow area-specific import rules when code is consumed by another workspace. Agent runtime source imports must use `@supernova/agent-runtime/...` where they need to typecheck from dependent packages.
- Do not create local `index.ts` barrels. The deliberate exception is the public `schemas` and `procedures` exports in [Contracts](contracts.md#exports).
- Keep logging minimal and purposeful. Remove noisy debugging output introduced during the work.

## Implementation layout

These rules apply to implementation logic regardless of its folder: operations, helpers, mappers, resolvers, builders, state holders, and lifecycle coordinators.

- Order function declarations as non-exported functions, then exported functions.

Component declaration order belongs in [Web](web.md#components-and-hooks); schema declaration order belongs in [Contracts](contracts.md#schema-organization).

## Comments

Code is the memory. A name, a type, and a body say what something does; a comment is only for what they cannot say: why a choice was made, which invariant a line protects, which external quirk it works around, where ported code came from.

- Do not describe what the code does. `/** Lists the sessions */` above `listSessions`, a field annotation that repeats the field name, or a line comment narrating the next statement is noise; delete it.
- Do not comment by default. Most functions, classes, interfaces, props, and schema fields need nothing. Write a comment only when a reader would otherwise get something wrong.
- Keep it to one line where possible, two at most. If the reason needs a paragraph, the code probably needs a better shape.
- Use `/** */` when the comment sits above a declaration (function, class, member, schema field), so it shows on hover at call sites. Use `//` inside bodies.
- A `TODO` names the condition that resolves it: `TODO(queue): write the turn record when the engine places it`. A bare `TODO: clean up` is not allowed.
- Never commit commented-out code; Git has it.
- When a comment and the code disagree, the comment is wrong. Fix or delete it in the same change, and do not take a stale comment's word over the code when reading.
