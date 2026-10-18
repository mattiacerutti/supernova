---
name: commit-message
description: Generates Conventional Commit message suggestions from git changes. Use when the user asks for commit messages, branch names, or similar naming suggestions for current changes.
---

# Commit Message

Generate commit messages using the Conventional Commits format for the current git changes.

Use the current chat as secondary context if it can help explain the intent of the changes.

Do not use unrelated earlier discussion. If the chat contains multiple tasks or commits, only consider the portion that is clearly supported by the staged changes. If chat context and staged changes conflict, trust the staged changes or ask for clarification.

## Rules

- Output a maximum of 5 alternatives
- Each alternative must summarize the overall intent of the full changeset.
- Do not make alternatives that each focus on a different file, package, or minor subchange unless the changes are truly unrelated and should be split into multiple commits (in this case, explicitly tell the user).
- If the changes are cohesive, every alternative must describe the same overall change at the highest useful level, with different wording or scope choices only.
- Prefer the repository’s existing commit style and scope names. Inspect recent commit messages when available, and mirror their scope conventions, tense, and specificity.
- If no recent scope fits the current changes, suggest a new scope, but only when existing scopes would be misleading.

### Examples

Examples for cohesive changes:

Bad:
feat(ui): update settings form
refactor(api): rename settings endpoint
test(settings): add settings persistence coverage

Good:
feat(settings): persist user settings
feat(settings): add durable settings storage
feat(settings): save preferences across restarts

## Output Format

- One per line
- No numbering
- No quotes
- No explanations
- Conventional Commits format: `type(scope?): description`
- Maximum 72 characters per line
