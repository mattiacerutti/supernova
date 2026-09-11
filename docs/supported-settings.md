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

## Not yet supported

Anything absent from the supported tables is ignored, including:

- Proxy settings, model/reasoning defaults, default tools, and model cycling.
- Resource paths, packages, extensions, prompt templates, and resource enable/disable settings.
- Session storage overrides, message queues, branch summaries, and trust preferences.
- Image blocking and GUI/TUI preferences.
- `compaction.modelOverrides` and `retry.maxAgentDelayMs`: these are not available in the currently pinned Pi 0.83.0 settings API.

This list tracks implemented support, not every capability in [Pi's latest settings documentation](https://pi.dev/docs/latest/settings.md).
