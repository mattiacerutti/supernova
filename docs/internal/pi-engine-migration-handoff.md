# Handoff: migrate Supernova's agent runtime to `pi-durable`

You are replacing the Pi SDK that powers `packages/agent-runtime` (`createAgentSession`, `AgentSession`, `SessionManager`) with Pi's new durable engine, `@earendil-works/pi-durable`, running **in-process in our server**. The web client and our RPC contracts stay as they are.

**The goal is 100% feature parity with today's Supernova, a smaller codebase, and the existing structure preserved.** A previous attempt failed on exactly these points: it silently stopped injecting our settings, rewrote modules wholesale instead of keeping our structure, left the synthetic-branch machinery and other dead code behind, and forgot tools and the system prompt. Treat every section below as a requirement, not a suggestion.

Background and rationale: [Pi Harness v2 Migration Options](../pi-harness-v2-migration.md) (this is "Option A"). Before editing an area, read its guide: [Agent runtime](agent-runtime.md), [Session runtime](session-runtime.md), [Checkpoint system](checkpoint-system.md), [Contracts](contracts.md), [Coding standards](coding-standards.md), [Development](development.md).

## Ground rules

1. **Inventory before you change anything.** Produce a written parity checklist (see below) mapping every current capability to where it will live after the migration. Every item ends in one of: *ported*, *replaced by engine feature X*, or *explicitly agreed to drop*. Nothing is dropped silently.
2. **Preserve the structure.** Keep the existing feature layout of `packages/agent-runtime` (feature folders, command modules, the RPC edge, Effect service boundaries). Replace implementations *inside* that structure. If you believe a module should be restructured, merged, or split, **stop and ask** with a short justification. Do not rewrite a module just because it touches the SDK.
3. **The contracts and the web client do not change** unless a contract genuinely cannot be satisfied by the new engine. If that happens, stop and ask, with the specific contract and why.
4. **Delete what the engine makes unnecessary.** Removing custom code is a primary goal of this migration, not a nice-to-have. See *Cleanup mandate*.
5. **Read the engine's real API; never guess signatures.** The authoritative sources are in the Pi checkout at `.context/pi`: `packages/durable/README.md`, `packages/durable/docs/pico-v5.md`, the examples under `packages/durable/test/examples/`, the exported types, and **Pi's own coding agent on durable** (see *Upstream reference implementation*). Pull `.context/pi` first.
6. **Isolate the engine.** All `pi-durable` imports live behind our own modules in `agent-runtime`. Every other module talks to our interfaces, so an upstream API change is contained.
7. **Verify as you go.** Each step below ships with its tests passing. Do not batch verification to the end.

## Engine primer

Read the real docs; this is orientation only.

- **`Harness.open(storage, { models, registry, ... }, ctx)`** is the entry point. Conversations are created/looked up from it. Every async call takes a Chord `Context` as its last argument.
- **Four durable primitives.** *Entries* (append-only transcript, paged queries). *Documents* (current JSON state, mutated in transactions, replicated to watchers, optionally `rewindable` with a fork policy and versioned migrations). *Tasks* (generation, tool calls, compaction, background jobs; durable with crash recovery). *Memos* (idempotency receipts, e.g. a hook remembering an approval across a crash).
- **Per-conversation agent configuration** lives in the rewindable `pi.agent` document (model, thinking level, extension/tool selection, `instructions`, `cwd`), changed via `configure()`. **Run policies** (retry, compaction thresholds, tool execution, queue modes) are Harness-wide `HarnessSettings`. The older `pi.conversation.config` getters/setters no longer exist; if you find examples using them, they are stale.
- **Extensions** (`defineExtension`) bundle tools, hooks, system-prompt sections and task kinds; installed by name into a registry we own, selectable per conversation, reloadable while work runs.
- **System prompt** is built from named sections (`section(key, render)`), re-sent only when changed (keeps provider prompt caches warm — a section that changes every render defeats this).
- **Built-in tools:** `CodingTools` bundles `read`, `write`, `edit`, `bash`. **`grep`, `find` and `ls` are not provided** by the engine.
- **Observation:** `conversation.watch()` gives a structural snapshot + ordered updates; `watchEvents()` gives coding-agent-style events (`message_start`, `message_update`, `tool_execution_start`, …) with deltas. Choose whichever maps more cleanly onto our current timeline; prefer the one that lets more of our custom code be deleted.
- **Storage:** memory, JSONL and SQLite backends ship with the engine. SQLite in shared-database mode gives indexed lookup and single-query listing.
- **Subagents** are owned conversations; there is no built-in subagent tool.

## Upstream reference implementation

Pi is doing the same migration for its own product, on `main`: an experimental TUI coding agent on `pi-durable` in `packages/coding-agent/src/experimental/durable/` (landed 2026-10-01, ~1,300 lines). **Read it before writing code.** It is the closest thing to a worked example of this handoff: one process owning the model runtime, a durable Harness, SQLite storage and a UI.

| File | Shows |
| --- | --- |
| `runtime.ts` | Harness and registry setup, `ModelRuntime` as `models`, SQLite storage, settings flowing into Harness settings, environments, the view/controller split |
| `prompt.ts` | Pi's system prompt (tool guidance, rules, docs, `AGENTS.md`, skills, cwd) packaged as one `defineExtension` of sections |
| `sessions.ts` | session directories and a single-process lock |
| `subagent.ts` | a foreground subagent tool over owned conversations |
| `tui.ts` | rendering from `Conversation.viewState()` and the task graph |
| `README.md` | behaviour, and an explicit list of what it does **not** do yet |

What it confirms for us:

- **Reusing Pi's old format readers is the intended pattern.** Pi's durable agent does not get new loaders; it imports its existing `core/` modules (`ModelRuntime`, `SettingsManager`, `system-prompt.ts`, `skills.ts`, `resource-loader.ts`, the tools' prompt contributions, the HTTP dispatcher) via relative paths and feeds their plain output into the engine. Our plan does the same.
- **Settings are wired explicitly.** Compaction thresholds, retry policy, queue modes and request timeouts come from `settings.json` and are read through Harness settings getters at each use. Nothing is applied by the engine on its own.
- **There is setup the old SDK did implicitly.** Pi configures its HTTP dispatcher and proxy settings before running; its README notes that "without it some provider streams end early". This is easy to miss and is a parity requirement for us.

Its stated gaps are things we must build ourselves, with no upstream example: session list and resume, forks and tree navigation, **extensions**, prompt templates, images, and `/login`. It also uses only `CodingTools`, so `grep`/`find`/`ls` are absent there too.

It is experimental and moves fast. Use it to learn the API and the wiring; do not copy its structure over ours (ground rule 2), and re-read it if the engine API looks different from what this document describes.

## Reuse from `pi-coding-agent` vs. build ourselves

Supernova stays compatible with Pi's **file formats** (settings, skills, prompt templates, extension packages) while using our own directories. Those formats are only implemented in `@earendil-works/pi-coding-agent`, which is still built on the *old* engine. The rule: **reuse what reads files and returns plain data; replace what touches the engine** (anything that consumes or produces `AgentSession`, `SessionManager`, `SessionEntry`, `AgentTool`/`ToolDefinition`, or old session events). Pin the version, and keep every reused or ported module behind one of our own modules so a change upstream is a one-file fix.

Pi's reference agent imports these through relative paths inside its own package. **We can only use what the package exports**: its exports map is limited to `.`, `./rpc-entry`, `./client` and `./experimental/plugin`, so deep imports into `src/core/` are not possible. That splits the reused pieces in two.

**Import (publicly exported, engine-independent):**

| What | Export | How it reaches the engine |
| --- | --- | --- |
| Models, providers, credentials | `ModelRuntime` | Pass as `models` to `Harness.open` — it implements pi-ai's `Models` directly |
| Settings | `SettingsManager`, pointed at our directories | We read values and pass each to `configure()` / Harness settings ourselves |
| Skills | `loadSkills` | Plain `Skill[]` → a system-prompt section |
| Project context files (`AGENTS.md` etc.) | `loadProjectContextFiles` | Plain content → a system-prompt section |
| Prompt templates and the resources we already wrap | the resource loader behind our `CustomPiResourceLoader` | Plain results → sections / composer data |
| Extension install/update | `DefaultPackageManager` | Writes files on disk; no engine involvement |
| Extension discovery and module loading | `discoverAndLoadExtensions` / `loadExtensions` | Collects what each extension registered; our bridge (below) turns it into engine extensions |

**Port (not exported — copy the file, MIT):**

| What | Upstream file | Notes |
| --- | --- | --- |
| System prompt sections | `core/system-prompt.ts` (`buildSystemPromptSections`) | Harness-agnostic; maps 1:1 onto engine `section(...)`s. See `experimental/durable/prompt.ts` for how Pi wraps it |
| Tool prompt guidance | `*ToolSystemPromptContribution` in `core/tools/{bash,edit,read,write}.ts` | The per-tool text the old prompt included |
| HTTP dispatcher and proxy setup | `configureHttpDispatcher`, `applyHttpProxySettings` (`core/http-dispatcher.ts`) | Required: without it some provider streams end early |
| Initial model selection | `findInitialModel` (`core/model-resolver.ts`) | Or reproduce our current default-model logic |
| `grep`, `find`, `ls` tools | `core/tools/{grep,find,ls}.ts` | Not in `CodingTools`; needed for parity |

Every ported file starts with a comment naming its upstream path and the commit it was copied from, so it can be diffed against upstream later. If Pi starts exporting one of these, switch to the import and delete the copy.

**Build ourselves (engine-coupled upstream, no replacement exists yet):**

- **The extension bridge.** Pi's `ExtensionRunner` is wired to the old engine (it imports old message/tool types, `SessionManager` and TUI theming), so it cannot be reused, and Pi's reference agent has no extension support at all. We write the bridge: take what the loader collected from each extension and produce a `defineExtension(...)` — event handlers become engine **hooks**, registered tools become engine **tools** (shape conversion required), prompt contributions become **sections**, and `ctx.ui` calls route to our UI. Inventory today's supported event and `ctx.ui` surface, map each item, and make anything unmapped **fail loudly**. Keep the bridge in one module so a future upstream runner can replace it.
- **Tool shape conversion** for our own `web_fetch` and for extension-registered tools.
- **Session export**, if we use it (Pi's depends on the old `SessionManager`).

Verify each module's imports when you adopt it. If one turns out to depend on the old engine, move it to "build ourselves" and say so in the parity checklist.

## Vendoring the engine from source

The published npm `0.99.2` predates the `pi.agent` / `configure()` / `defineExtension` surface this migration targets, so **vendor `pi-durable`, `chord` and `pi-ai` from a pinned upstream commit**. All three must come from the same commit.

1. **Pin a commit.** In `.context/pi`: `git pull --ff-only`, record `git rev-parse HEAD`, and record the milestone status line in `packages/durable/docs/pico-v5-handoff.md`. Use a commit where packages 1–23 are implemented (the full plan) and that includes `packages/coding-agent/src/experimental/durable/`, so the reference implementation matches the engine you vendor.
2. **Build** (Node ≥ 22.19): `npm install --ignore-scripts && npm run build`. If it fails, step back one commit at a time; never patch upstream source.
3. **Give all three packages the same unpublished patch version** (check the registry for the next free one, e.g. `0.99.3`): `for p in durable chord ai; do (cd packages/$p && npm version <version> --no-git-tag-version); done`. **Do not use a prerelease suffix** such as `0.99.2-sha.abc`: `pi-durable` depends on its peers with caret ranges, and caret ranges do not match prereleases, so the registry copies would be used instead of the vendored ones.
4. **Pack** into `vendor/pi/` in this repo: `for p in durable chord ai; do (cd packages/$p && npm pack --pack-destination <repo>/vendor/pi); done`. Do not commit the version bumps in `.context/pi`.
5. **Record provenance** in `vendor/pi/PROVENANCE.md`: full commit SHA, commit date, milestone status line, packed date, and the version used.
6. **Install.** Add the three `file:` tarball dependencies to `packages/agent-runtime`, and add root `overrides` for `@earendil-works/chord` and `@earendil-works/pi-ai` pointing at the same tarballs, so no transitive range can resolve to the registry. Run `bun install` from the root and confirm the lockfile references only the tarballs for these three packages.
7. **Smoke test** with a throwaway script: `Harness.open` on `MemoryStorage`, install `CodingTools`, `configure()` a model, `submit` a prompt, and observe it through `watch()`. Delete the script afterwards.
8. **Commit `vendor/pi/`** — the tarballs are what makes the build reproducible.

`pi-coding-agent` is **not** vendored: it stays a normal pinned registry dependency, since we only use its format readers. If its pinned version requires a different `pi-ai` than the vendored one, stop and report the conflict rather than forcing it.

When a published release contains everything we use, replace the tarballs with pinned registry versions and delete `vendor/pi/`.

## Feature parity checklist

Your inventory must cover at least every item below. Find each one in today's code, record how it works now, and record where it lives after the migration.

### Configuration and settings
- **Every setting we read today must still be applied.** Find every place settings flow into the old SDK — including implicit ones the SDK applied on our behalf — and wire each one explicitly: default model, thinking level, active tools, retry and compaction settings, queue/steering behaviour, and anything else we read. With durable, nothing is applied automatically; a setting that is read but not passed to `configure()` / `HarnessSettings` is a parity bug.
- Our settings and resource directories (not `~/.pi`) must still be honoured, with the same precedence (global vs project) as today.
- Settings changes made from the UI must take effect on the next run and persist as they do today.

### Models, providers and credentials
- Model listing, refresh, selection, context-window and thinking-level mapping.
- Provider login and logout, including OAuth flows, and the auth sources we show in the UI.
- Credentials still come from where they come from today.
- **HTTP dispatcher and proxy settings are configured before any request**, as Pi does. The old SDK did this implicitly; without it some provider streams end early.

### System prompt
- **Port Pi's system prompt.** The old SDK built it for us; durable does not. Port `buildSystemPromptSections` and the per-tool prompt contributions (see *Port* above) and install them as engine sections, following `experimental/durable/prompt.ts`. Include everything the old prompt contained: identity/instructions, tool guidance for every tool we expose (including `grep`/`find`/`ls`/`web_fetch`), rules, docs references, skills, cwd/environment, and project context files (e.g. `AGENTS.md`).
- Diff the final rendered prompt for a representative session against the old SDK's prompt and resolve every difference.

### Tools
- **Every tool the model could use before must exist after**, with the same names, schemas, descriptions and behaviour: `read`, `write`, `edit`, `bash` from `CodingTools`; **port `grep`, `find` and `ls`** from Pi's coding-agent implementations (same output format, same truncation); our own `web_fetch`.
- Tool output truncation and image handling behave as before.
- Tool call rendering in our timeline (the per-tool details we map today) still works for every tool.
- Active-tool selection per session still works.

### Skills, prompt templates and resources
- Skills discovery and their injection into the prompt.
- Prompt templates and skill invocation from the composer.
- Composer suggestions (slash commands, skills, templates, file/folder mentions).

### Extensions
- Installed extensions still load. Map what today's extension loading provides onto `defineExtension` (tools, hooks, sections). Enumerate the extension events and `ctx.ui` calls we support today; each one must be ported or explicitly reported as unsupported. **Unsupported calls must fail loudly**, never silently no-op.
- Extension install/update from our package management flow still works, and updated extensions take effect (use the engine's live reload rather than recycling sessions where possible).

### Sessions
- Create, open, list, rename, archive/delete, per project.
- **Listing must be paged and lookup by id must be direct** — fixing the current scan-everything and load-everything behaviour is an explicit goal.
- Title generation still happens and still updates the UI. Prefer a background task writing to a document over custom wiring.
- Session context usage / token and cost reporting (the engine tracks usage in `pi.usage`).
- Session metadata we show in the sidebar and project views.

### Running a turn
- Send message with all current content types (text, images, attachments, mentions).
- Streaming text and thinking, tool calls with live output, final settled messages.
- Steer, follow-up and queued messages while busy; cancelling queued input.
- Abort; resume after an interrupted turn; behaviour after a server restart mid-turn (must leave a recoverable session).
- Error surfacing: provider errors, retries, tool errors reach the UI as they do today.

### Compaction
- Manual compaction from the UI; automatic threshold and overflow compaction; how compaction appears in the timeline.

### Checkpoints and navigation
- Checkpoint capture per turn, undo, redo, revert-to-message, and timeline navigation — with git/shadow-repository behaviour unchanged.
- Move checkpoint bookkeeping from custom entries to engine state (a rewindable document and/or the engine's navigation/fork primitives). Keep the shadow repository and git logic as they are.
- All existing checkpoint regression tests are ported and pass.

### Worktrees and workspace
- Worktree creation and association with sessions (today stored via a custom entry) keeps working; move its state to engine state.
- Anything workspace/terminal-related that touches the session runtime keeps working.

### Legacy sessions
- **Existing sessions must not be lost or corrupted.** The new engine cannot read old session files and there is no upstream converter. Propose an approach (read-only legacy view via the old SDK behind a flag, a converter, or something else) and **ask before implementing it**. Never modify or delete existing session files.

## Cleanup mandate

The point of this engine is that it replaces custom machinery. When you finish, the following should be **gone**, not left beside the new path:

- Synthetic live-branch entries and everything that builds, merges, or reconciles them.
- Checkpoint and checkpoint-cursor custom entries, and the code that reads/writes them.
- Worktree custom entries, once their state has moved.
- Active-turn / in-flight operation bookkeeping that tasks and submissions now own.
- Event-bus bridging that existed only to translate old SDK events.
- Session-file scanning for listing or lookup.
- Prompt-building code superseded by engine sections.
- Any adapter, type, or helper that only existed to work around the old SDK.
- Imports, types, tests and fixtures orphaned by the above.

For every deletion, confirm the behaviour it provided is covered by the parity checklist. Flag — do not delete — dead code unrelated to the migration.

## Suggested order

Each step ends green (build, typecheck, tests) before the next starts.

1. **Read the reference implementation, then inventory and write the parity checklist.** Share the checklist before writing code.
2. **Vendor and engine module.** Vendor the engine per *Vendoring the engine from source*; create the isolated engine boundary; open a Harness with our storage, models, registry and settings.
3. **Settings, models, credentials, system prompt, tools, skills.** Everything the agent needs to behave identically before a single turn runs. Verify the rendered prompt and tool list against the old SDK.
4. **Sessions.** Storage, paged listing, lookup by id, rename/archive, metadata.
5. **Running a turn.** Send, stream, steer/follow-up/queue, abort, resume, errors — through the existing RPC contracts and timeline.
6. **Checkpoints, worktrees, navigation.**
7. **Compaction, title generation, usage.**
8. **Extensions.** Loading, supported events/`ctx.ui`, install/update and reload.
9. **Legacy sessions** (after agreement on the approach).
10. **Cleanup** per the mandate, then a final parity review.

## Done means

- Every parity checklist item is marked ported, replaced, or explicitly agreed to drop — with a test or a manual verification note for each.
- No `AgentSession`, `SessionManager`, `SessionEntry` or `ToolDefinition` usage remains outside the legacy-session path.
- The cleanup mandate items are removed.
- `vendor/pi/` contains the three tarballs and a `PROVENANCE.md` recording the exact upstream commit.
- `bun run build`, `bun run lint`, `bun run typecheck`, `bun run test` and `bun run test:e2e` pass from the repository root.
- A manual end-to-end pass in the desktop app covers: new session, prompt with tools, steer mid-run, abort, restart the server mid-turn and recover, compaction, checkpoint undo/redo/revert, worktree session, title generation, model and thinking-level change, extension update.
- User-facing changes have entries under `## [Unreleased]` in `CHANGELOG.md`.
- A short summary lists what was deleted, what was ported, any open questions, and anything that could not be verified.
