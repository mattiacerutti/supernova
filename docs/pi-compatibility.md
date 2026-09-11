# Pi compatibility

Supernova uses **Pi 0.85.1** as its coding engine, with its own interface and configuration directories. This page describes compatibility; for usage, formats, and configuration rules, see [Pi's documentation](https://pi.dev/docs).

## Feature compatibility

| Feature                  | Status        | Notes                                                                                                                                                        | Pi documentation                                                   |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Settings                 | Partial       | See supported settings keys below.                                                                                                                           | [Settings](https://pi.dev/docs/latest/settings.md)                 |
| Skills                   | Supported     | Includes `.agents` skills, Supernova's skill directories, configured paths, and package-provided skills. Explicit selection uses Supernova's `$` references. | [Skills](https://pi.dev/docs/latest/skills.md)                     |
| Packages                 | Supported     | npm, Git, and local packages are supported. Unsupported resource types remain disabled. No package-management UI or automatic package-update workflow.       | [Packages](https://pi.dev/docs/latest/packages.md)                 |
| Extensions               | Partial       | Headless tools and hooks are supported. See limitations below.                                                                                               | [Extensions](https://pi.dev/docs/latest/extensions.md)             |
| Extension slash commands | Planned       | Not integrated into the composer.                                                                                                                            | [Extensions](https://pi.dev/docs/latest/extensions.md)             |
| Shared instructions      | Supported     | Project/ancestor `AGENTS.md`, global agent instructions, and `~/.agents/AGENTS.md` are loaded.            | [Pi overview](https://pi.dev/docs)                                 |
| System prompt files | Planned | `SYSTEM.md` and `APPEND_SYSTEM.md` are not loaded. Pi's built-in system prompt remains active. | [Pi overview](https://pi.dev/docs) |
| Prompt templates         | Planned       | Not loaded, including templates distributed in packages.                                                                                                     | [Prompt templates](https://pi.dev/docs/latest/prompt-templates.md) |
| Themes and terminal UI   | Not supported | Supernova uses its own interface and appearance settings.                                                                                                    | [Themes](https://pi.dev/docs/latest/themes.md)                     |

### Extension limitations

**Extensions that render UI are currently not supported.** Supernova is waiting for Pi's upstream Harness v2 before integrating extension-provided UI. Current extension support is limited to headless tools and hooks.

- Custom tools display their names, arguments, text output, JSON details, and errors.
- Custom image-result rendering is not supported.
- Extension-driven session replacement and background-triggered agent runs are not supported.

## Supernova-specific differences

- Configuration lives on the machine running the Supernova server. Global settings use `~/.supernova/userdata/agent/settings.json`, development settings use `~/.supernova/dev/agent/settings.json`, and project settings use `<project>/.supernova/settings.json`.
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
