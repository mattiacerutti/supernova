# Pi compatibility

Supernova uses **Pi 1.1.0** as its coding engine, with its own interface and configuration directories. This page describes compatibility; for usage, formats, and configuration rules, see [Pi's documentation](https://pi.dev/docs).

## Feature compatibility

| Feature                  | Status        | Notes                                                                                                                                                        | Pi documentation                                                   |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Settings                 | Partial       | See supported settings keys below.                                                                                                                           | [Settings](https://pi.dev/docs/latest/settings.md)                 |
| Custom models            | Supported     | Custom providers and models, such as local ones, configured through the global `models.json` file.                                                           | [Models](https://pi.dev/docs/latest/models.md)                     |
| Skills                   | Supported     | Includes `.agents` skills, Supernova's skill directories, configured paths, and package-provided skills. Explicit selection uses Supernova's `$` references. | [Skills](https://pi.dev/docs/latest/skills.md)                     |
| Packages                 | Supported     | npm, Git, and local packages are supported. Unsupported resource types remain disabled. No package-management UI or automatic package-update workflow.       | [Packages](https://pi.dev/docs/latest/packages.md)                 |
| Extensions               | Partial       | Pi extensions run headless on the new engine: tools, providers, and most events. See [Extensions](#extensions) below.                                        | [Extensions](https://pi.dev/docs/latest/extensions.md)             |
| Extension slash commands | Planned       | Not integrated into the composer.                                                                                                                            | [Extensions](https://pi.dev/docs/latest/extensions.md)             |
| Shared instructions      | Supported     | Project/ancestor `AGENTS.md`, global agent instructions, and `~/.agents/AGENTS.md` are loaded.                                                               | [Pi overview](https://pi.dev/docs)                                 |
| System prompt files      | Planned       | `SYSTEM.md` and `APPEND_SYSTEM.md` are not loaded. Pi's built-in system prompt remains active.                                                               | [Pi overview](https://pi.dev/docs)                                 |
| Prompt templates         | Planned       | Not loaded, including templates distributed in packages.                                                                                                     | [Prompt templates](https://pi.dev/docs/latest/prompt-templates.md) |
| Themes and terminal UI   | Not supported | Supernova uses its own interface and appearance settings.                                                                                                    | [Themes](https://pi.dev/docs/latest/themes.md)                     |

### Extensions

Supernova runs sessions on Pi's new engine, `pi-durable`. Pi's own coding agent has not moved to it yet, so every extension that exists today is written for Pi's current extension API, and the engine has no extension format of its own that extension authors can target. Until Pi defines one, Supernova loads existing Pi extensions and runs them against the new engine. When Pi settles its durable extension format, Supernova will load those directly; extensions written for it will not need a Supernova-specific version.

In the meantime, the goal is that an extension that worked in Supernova before the engine change keeps working. Supernova has always run extensions without a terminal, as Pi does in its print mode (`pi -p`), and that is unchanged:

- `ctx.hasUI` is false. `ctx.ui` calls do nothing, and its dialogs answer "no" (`confirm` resolves false, `select` and `input` resolve undefined). Commands, shortcuts, flags, and message renderers are accepted but never shown. Supernova reports these in the session so you can tell why an extension's UI does not appear.
- Providers registered by extensions (`pi.registerProvider`) work.
- Custom tools work and display their names, arguments, text output, JSON details, and errors. Custom image-result rendering is not supported.
- `tool_call` can block a call or change its arguments; `tool_result` can replace the result; `context` can edit the request; `session_before_compact` can cancel a compaction or supply the summary.

The engine exposes requests, responses, tool calls, and compactions rather than Pi's agent loop, so events fire at the closest engine moment. Delivered: `session_start`, `session_shutdown`, `before_agent_start` (its result is not applied), `agent_start`, `agent_end`, `agent_settled`, `turn_start`, `turn_end`, `message_start`, `message_end`, `context`, `tool_call`, `tool_result`, `tool_execution_start`, `tool_execution_end`, `session_before_compact`.

Not delivered, and reported in the session when an extension subscribes: streaming updates (`message_update`, `tool_execution_update`), `input`, `session_compact`, `model_select`, `thinking_level_select`, and the session tree, fork, switch, and info events. Extension-driven session replacement and background-triggered agent runs are not supported.

## Supernova-specific differences

- Configuration lives on the machine running the Supernova server. Global settings use `~/.supernova/userdata/agent/settings.json`, development settings use `~/.supernova/dev/agent/settings.json`, and project settings use `<project>/.supernova/settings.json`.
- Custom model configuration uses `~/.supernova/userdata/agent/models.json`, or `~/.supernova/dev/agent/models.json` in development, on the server machine. Project-local `models.json` files are not loaded.
- Supernova does not read Pi's default `~/.pi/agent/settings.json` or `.pi/settings.json`.
- Resource reload is not yet integrated. Applying configuration/resource changes to active sessions requires restarting the app; browser users should also restart the server and refresh the page.
- Supernova's `/compact`, `/undo`, and `/redo` are its own actions. Other Pi terminal commands are not automatically available.
- There is no sandbox or project trust prompt. Opening a project composer can load and execute extensions with full server permissions.

## Supported settings

Each supported setting path is listed individually below. See [Pi's settings reference](https://pi.dev/docs/latest/settings.md) and [package documentation](https://pi.dev/docs/latest/packages.md) for syntax, values, and behavior. Settings not listed here are not supported.

| Setting                          |
| -------------------------------- |
| `defaultProvider`                |
| `defaultModel`                   |
| `defaultThinkingLevel`           |
| `modelThinkingLevels`            |
| `thinkingBudgets.minimal`        |
| `thinkingBudgets.low`            |
| `thinkingBudgets.medium`         |
| `thinkingBudgets.high`           |
| `compaction.enabled`             |
| `compaction.reserveTokens`       |
| `compaction.keepRecentTokens`    |
| `retry.enabled`                  |
| `retry.maxRetries`               |
| `retry.baseDelayMs`              |
| `retry.provider.timeoutMs`       |
| `retry.provider.maxRetries`      |
| `retry.provider.maxRetryDelayMs` |
| `transport`                      |
| `httpIdleTimeoutMs`              |
| `websocketConnectTimeoutMs`      |
| `shellPath`                      |
| `shellCommandPrefix`             |
| `images.autoResize`              |
| `enableInstallTelemetry`         |
| `extensions`                     |
| `packages`                       |
| `skills`                         |
| `npmCommand`                     |
