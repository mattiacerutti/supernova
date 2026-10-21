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

Write like a developer explaining the change to another developer: short, human, direct, and informational.

- Open with one or two sentences: the problem and what the PR does about it. No "Summary" heading.
- Describe changes in present tense, with "This PR" stated or implied: "Fixes", "Centralizes", "Adds". This applies to bullets too. Avoid imperative instructions ("Fix") or past-tense work logs ("Fixed"); past tense is fine when explaining the previous behavior.
- Group changes by outcome, not by commit or file. Use bullets only for several independent outcomes, one line each.
- State what changes for users or reviewers, not how it is implemented. Leave out internals (library mechanics, hook or function names, data flow) unless a reviewer needs them to judge risk.
- Include at most one headline measurement, and only when the PR is about performance. Detailed numbers belong in comments or linked notes.
- Mention important limitations in one line each. Only make claims supported by the changes or known context.
- Do not add a verification or testing section, or list routine test, lint, build, or CI results.
- Avoid file-by-file inventories, commit dumps, marketing language, and boilerplate headings or checklists unless required by the repository.

Use a natural, matter-of-fact voice. Give readers enough context to understand the intent without narrating the implementation.
Length limits: a small fix gets two or three sentences; even a large PR stays under about 120 words and five bullets. If a draft is longer, cut it before showing it, and remove any sentence a reviewer would not miss.

Publish the branch and create the PR, then return its URL. Do not overwrite remote work, commit uncommitted changes, or merge without permission.
