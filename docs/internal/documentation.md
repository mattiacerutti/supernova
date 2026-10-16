# Documentation

## Audience and placement

- `docs/` is for people using Supernova: setup, configuration, compatibility, workflows, and limitations. Keep contributor tooling and implementation details out of these guides.
- `docs/internal/` is for developers and coding agents building Supernova: conventions, cross-package constraints, architectural decisions, and development/release procedures.
- `docs/assets/` holds assets used by user-facing documentation.
- The root `AGENTS.md` is the only agent instruction entry point. Keep it short and link to internal guidance by task. Do not add package-level `AGENTS.md` files or duplicate rules in skills.

Product direction belongs in the internal product guide; shipped usage belongs in user guides. A document being readable by users does not make it a user guide.

## What to write

Record what a contributor would otherwise get wrong: product philosophy, ownership boundaries, decisions and their reasons, failure guarantees, and coding conventions. Preserve the explanations and examples that teach judgment—not just a summary of the rules. Coding hygiene, quality, naming, and file/folder conventions belong here even when tools also enforce them.

Code is the source of truth for implementation. Remove clear duplication such as copied types, exhaustive method catalogs, and call-by-call narration; link to the owning code instead. Keep architectural overviews, structural conventions, tradeoffs, and non-obvious limitations when they help contributors understand the system. A folder convention is not the same as an inventory of today's files.

For user guides, explain how to accomplish a task and what limitations affect it. Avoid cataloging visible buttons or describing every UI state.

## How to maintain it

- Give each subject one home. Link from related pages instead of repeating the same rules.
- Trim conservatively, without a length or reduction target. Preserve substance and voice; shorten repetition rather than replacing a guide with a checklist. If a passage may contain intentional philosophy or policy, clarify before removing it.
- When code and docs disagree, distinguish stale description from an intended constraint the code violates. Correct the former; flag the latter rather than silently weakening the rule.
- Rewrite the affected section when behavior changes. Don't append task summaries or a second account of the same behavior.
- Keep durable guidance separate from temporary plans, research notes, and work logs.
- When adding a page, link it from the appropriate documentation index. Add a task link in `AGENTS.md` when agents need it to find a convention or constraint.
- When moving a page, update incoming links and check its relative links. Do not leave duplicate copies at old paths.

## Voice

Use plain, short sentences. Address the reader directly. State the rule, then explain the reason only when it adds information. Match the page you are editing; avoid slogans, emphatic repetition, and claims like “seamless” or “powerful.”
