# Supported settings

Supernova supports the following Pi runtime settings in `settings.json`. Only the keys listed below are enabled; other Pi settings are ignored.

## File locations

Settings live on the machine running the Supernova server:

| Scope | Default location |
| --- | --- |
| Global | `~/.supernova/userdata/agent/settings.json` |
| Global during development | `~/.supernova/dev/agent/settings.json` |
| Project | `<project>/.supernova/settings.json` |

`SUPERNOVA_HOME` changes the global base directory; the `userdata/agent` or `dev/agent` suffix remains. Supernova does not automatically read `~/.pi/agent/settings.json` or `.pi/settings.json`.

Project settings override global settings using the bundled Pi SDK's merge behavior. Omitted supported values use Pi defaults. Settings are read when a session's agent runtime is created, not on every message. Restart the server/app to reliably apply edits to already-active sessions. Model selections and other session-local changes do not write back to these files.

Missing files are fine. Unreadable files or malformed JSON prevent that agent runtime from starting and produce an error rather than silently ignoring configuration. Value interpretation and validation otherwise follow the bundled Pi SDK.

Project settings currently follow Supernova's existing trusted-project policy; there is no Pi trust prompt. In particular, only open projects whose shell configuration you trust. Unsupported trust settings do not restrict tool execution.

## Supported keys

### New-session model defaults

| Setting | Purpose |
| --- | --- |
| `defaultProvider` | Default provider for a new session. |
| `defaultModel` | Exact provider-scoped model ID for a new session. |
| `defaultThinkingLevel` | Startup reasoning preference: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. |

Project values override global values independently. Configure both provider and model to select an unambiguous pair. A provider alone selects its first available model; a model alone selects the first available exact ID match. Model patterns are not supported here.

For new sessions, selection precedence is explicit composer choice → configured default → recently used model → first available model. An unavailable configured model silently falls back to the model shown in the picker. With no available models, sending stays disabled.

The configured reasoning level is normalized to the selected model's supported levels. Explicit reasoning choices win, including `off`. Models without reasoning omit the level. Switching models manually preserves the existing reasoning-selection behavior. Startup defaults never overwrite resumed-session selections.

These defaults are applied by the composer and sent as an explicit model selection, not persisted back into settings files. New-session submission waits for the project configuration request to settle. Loading failures show a toast, with no inline error or retry controls in the composer. The composer uses the last cached defaults when available, otherwise its normal recent-model fallback. Backend runtime settings validation remains unchanged; unreadable or malformed settings files can still prevent the agent runtime from starting.

### Reasoning

| Setting | Purpose |
| --- | --- |
| `thinkingBudgets.minimal` | Token budget for minimal reasoning, where supported by the provider/model. |
| `thinkingBudgets.low` | Token budget for low reasoning. |
| `thinkingBudgets.medium` | Token budget for medium reasoning. |
| `thinkingBudgets.high` | Token budget for high reasoning. |

These configure budgets, not the selected model or reasoning level.

### Compaction

| Setting | Purpose |
| --- | --- |
| `compaction.enabled` | Enable or disable automatic compaction. Manual compaction remains available. |
| `compaction.reserveTokens` | Reserve tokens for the response. |
| `compaction.keepRecentTokens` | Keep this many recent tokens without summarizing them. |

### Retries

| Setting | Purpose |
| --- | --- |
| `retry.enabled` | Enable or disable automatic agent-level retries. |
| `retry.maxRetries` | Maximum agent-level retry attempts. |
| `retry.baseDelayMs` | Initial agent retry backoff in milliseconds. |
| `retry.provider.timeoutMs` | Provider request timeout in milliseconds. |
| `retry.provider.maxRetries` | Provider-level retry attempts. |
| `retry.provider.maxRetryDelayMs` | Maximum server-requested retry delay in milliseconds. |

### Transport

| Setting | Purpose |
| --- | --- |
| `transport` | Preferred transport for providers supporting it: `sse`, `websocket`, or `auto`. |
| `httpIdleTimeoutMs` | HTTP/stream idle timeout in milliseconds. |
| `websocketConnectTimeoutMs` | WebSocket connection timeout in milliseconds. |

### Shell

| Setting | Purpose |
| --- | --- |
| `shellPath` | Shell executable used by Pi's shell tool. |
| `shellCommandPrefix` | Initialization prepended to Pi shell-tool commands. |

These do not configure Supernova's own Git/checkpoint subprocesses or the browser's environment.

### Images

| Setting | Purpose |
| --- | --- |
| `images.autoResize` | Configure image resizing in Pi's built-in image-reading tool path. |

This is not an image-blocking policy or a setting for resizing the GUI's previews. Supernova passes composer images directly to Pi; do not assume this setting resizes every attachment.

### Privacy

| Setting | Purpose |
| --- | --- |
| `enableInstallTelemetry` | Control Pi provider attribution headers on the runtime request path. |

Pi's `PI_TELEMETRY` environment override takes precedence. Supporting this setting does not add Pi CLI install/update telemetry or opt users into Supernova analytics.

## Example

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "provider": {
      "maxRetries": 0,
      "maxRetryDelayMs": 60000
    }
  },
  "transport": "auto",
  "httpIdleTimeoutMs": 300000,
  "images": {"autoResize": true},
  "enableInstallTelemetry": false
}
```

## Client configuration API

`getConfiguration({projectPath?: string})` returns a typed, client-safe snapshot:

```ts
{
  modelDefaults: {
    providerId?: string;
    modelId?: string;
    thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  };
}
```

Without `projectPath`, only global settings are read—even when the server starts inside a project. With a path, the server reads and merges that project's settings. Responses are validated against shared contracts. Backend-only values and arbitrary custom keys are never returned, and errors do not include raw file contents.

The frontend loads global configuration at startup and effective project configuration when opening a new-session composer. Snapshots use the existing shared RPC client and live only in the query cache, with separate global and project entries; they are not stored in local storage. Opening the composer, reconnecting the event stream, or explicitly invalidating configuration queries refreshes them. A changed default never replaces an explicit composer selection.

This refresh behavior applies to client defaults only. Already-active agent runtimes retain their backend settings snapshot until recreated; restart the server/app to reliably apply runtime-setting edits.

## Not yet supported

Anything absent from the supported tables is ignored, including:

- Proxy settings, per-model reasoning defaults (`modelThinkingLevels`), default tools, and model cycling.
- Resource paths, packages, extensions, prompt templates, and resource enable/disable settings.
- Session storage overrides, message queues, branch summaries, and trust preferences.
- Image blocking and GUI/TUI preferences.
- `compaction.modelOverrides` and `retry.maxAgentDelayMs`: these are not available in the currently pinned Pi 0.83.0 settings API.

This list tracks implemented support, not every capability in [Pi's latest settings documentation](https://pi.dev/docs/latest/settings.md).
