import type {Models, ModelsSimpleStreamOptions} from "@earendil-works/pi-ai";
import type {ModelRuntime, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {HarnessSettings} from "@earendil-works/pi-durable";

/** The SDKs treat a timeout of 0 as "time out at once"; Pi's settings mean "disabled". */
const DISABLED_TIMEOUT_MS = 2_147_483_647;

/** Getters read `settings()` on every use, so a settings change applies to the next request. */
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
        // TODO(pi-durable): off until the timeline can show a compaction overlapping a streaming answer.
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

function requestOptions(settings: SettingsManager): ModelsSimpleStreamOptions {
  const budgets = settings.getThinkingBudgets();
  const websocketConnectTimeoutMs = settings.getWebSocketConnectTimeoutMs();
  return {
    // TODO(pi-durable): move to `HarnessSettings.stream` once `ConversationStreamOptions` carries these.
    ...(budgets === undefined ? {} : {thinkingBudgets: budgets}),
    ...(websocketConnectTimeoutMs === undefined ? {} : {websocketConnectTimeoutMs}),
  };
}

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
