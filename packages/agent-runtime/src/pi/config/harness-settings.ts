import type {Models, ModelsSimpleStreamOptions} from "@earendil-works/pi-ai";
import type {ModelRuntime, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {HarnessSettings} from "@earendil-works/pi-durable";

/** The SDKs treat a timeout of 0 as "time out at once"; Pi's settings mean "disabled". */
const DISABLED_TIMEOUT_MS = 2_147_483_647;

/**
 * Harness run policy from Pi's file settings. Getters read `settings()` at every use, so a settings change applies to
 * the next request without reopening the session. Every setting the old SDK applied is mapped here or in
 * `harnessModels` below (thinking budgets, websocket timeout) and `lib/tools/coding-tools.ts` (shell prefix, image resizing).
 */
export function harnessSettings(settings: () => SettingsManager): HarnessSettings {
  return {
    get stream() {
      const source = settings();
      const provider = source.getProviderRetrySettings();
      const idle = source.getHttpIdleTimeoutMs();
      return {
        transport: source.getTransport(),
        timeoutMs: provider.timeoutMs ?? (idle === 0 ? DISABLED_TIMEOUT_MS : idle),
        maxRetryDelayMs: provider.maxRetryDelayMs,
        ...(provider.maxRetries === undefined ? {} : {maxRetries: provider.maxRetries}),
      };
    },
    get retry() {
      return settings().getRetrySettings();
    },
    get compaction() {
      const source = settings();
      return {
        enabled: source.getCompactionEnabled(),
        reserveTokens: source.getCompactionReserveTokens(),
        keepRecentTokens: source.getCompactionKeepRecentTokens(),
        // TODO(pi-durable): the engine can summarize in the background before the blocking threshold. The old SDK
        // never did, and the timeline has no design for a compaction that overlaps a streaming answer. Off until then.
        backgroundTokens: 0,
      };
    },
    get steeringMode() {
      return settings().getSteeringMode();
    },
    get followUpMode() {
      return settings().getFollowUpMode();
    },
  };
}

/** What the old SDK added to every request from settings; the engine forwards only `ConversationStreamOptions`. */
function requestOptions(settings: SettingsManager): ModelsSimpleStreamOptions {
  const budgets = settings.getThinkingBudgets();
  const websocketConnectTimeoutMs = settings.getWebSocketConnectTimeoutMs();
  return {
    // TODO(pi-durable): workaround. `thinkingBudgets` and `websocketConnectTimeoutMs` are not in pi-durable's curated
    // `ConversationStreamOptions` (packages/durable/docs/pico-v5.md), and Pi's own durable agent does not forward them.
    // Upstream gives no reason for the omission. Monitor upstream: if they add these options, move them to
    // `HarnessSettings.stream` and delete this; if they explain the omission as deliberate, reconsider forwarding them.
    ...(budgets === undefined ? {} : {thinkingBudgets: budgets}),
    ...(websocketConnectTimeoutMs === undefined ? {} : {websocketConnectTimeoutMs}),
  };
}

/**
 * Wraps `ModelRuntime` for one session's Harness. Calls the engine makes go through unchanged except streaming, which
 * gets the session's settings-derived request options underneath the engine's own.
 */
export function harnessModels(input: {readonly modelRuntime: ModelRuntime; readonly settings: () => SettingsManager}): Models {
  const {modelRuntime, settings} = input;
  return new Proxy(modelRuntime as unknown as Models, {
    get(target, property, receiver) {
      if (property === "streamSimple" || property === "completeSimple") {
        const call = Reflect.get(target, property, receiver) as Models["streamSimple"];
        return (model: Parameters<Models["streamSimple"]>[0], context: Parameters<Models["streamSimple"]>[1], options?: ModelsSimpleStreamOptions) =>
          call.call(target, model, context, {...requestOptions(settings()), ...options});
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
