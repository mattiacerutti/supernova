---
name: create-pr
description: Create a pull request with conventional branch naming and title, and a concise, human description. Always use when the user asks to create, open, submit, or raise a PR or pull request.
---

# Create PR

Always read and use the [commit-message skill](../commit-message/SKILL.md) to generate the branch name, PR title, and any commit messages. For the PR title, use the full diff against the base branch rather than only staged changes.

## Branch

First determine whether the current branch already has a remote branch.

- If it exists and has a conventional name, use it. Otherwise stop and flag the name to the user; do not silently rename or replace it.
- If it does not exist, create it. Reuse the local name if conventional; otherwise choose a conventional remote name based on the overall changes, leaving the local name unchanged.
- Use `<type>/<short-kebab-case-summary>`, such as `feature/added-session-search`, `fix/fixed-reconnect`, or `refactor/session-runtime`.

## Title

Use Conventional Commits: `type(scope?): summary`, with an imperative summary, such as `feat: add session search`.

Summarize the overall outcome of the full PR, not one minor change or a list of commits. Keep it short and specific; use a scope only when useful.

## Description

Write like a developer explaining the change to another developer: concise, human, direct, and informational.

- Start directly with the goal or problem and what changed, without a “Summary” heading.
- Describe changes in present tense, with “This PR” stated or implied: “Fixes”, “Centralizes”, “Adds”. This applies to bullets too. Avoid imperative instructions (“Fix”) or past-tense work logs (“Fixed”); past tense is fine when explaining the previous behavior.
- Explain meaningful supporting changes and why they matter. Use short paragraphs, with bullets only when they help.
- Mention important limitations plainly. Only make claims supported by the changes or known context.
- Do not add a verification or testing section, or list routine test, lint, build, or CI results. The description explains the change; check status belongs in CI.
- Avoid file-by-file inventories, commit dumps, marketing language, and boilerplate headings or checklists unless required by the repository.

Use a natural, matter-of-fact voice. Give readers enough context to understand the intent without narrating the implementation. Focus on practical outcomes, and scale the length to the change: a small fix may need only two sentences.

Publish the branch and create the PR, then return its URL. Do not overwrite remote work, commit uncommitted changes, or merge without permission.
