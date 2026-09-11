import {SettingsManager} from "@earendil-works/pi-coding-agent";
import {loadPiSettings} from "@supernova/agent-runtime/layers/shared/lib/pi-settings";

/** Loads a session-local snapshot of the file settings Supernova supports, without writing back to disk. */
export function loadPiRuntimeSettings(cwd: string, agentDir?: string): SettingsManager {
  const source = loadPiSettings(cwd, agentDir);

  const budgets = source.getThinkingBudgets();
  const providerRetry = source.getProviderRetrySettings();

  // Select leaf keys explicitly so future Pi settings cannot silently become enabled.
  return SettingsManager.inMemory({
    thinkingBudgets: budgets && {minimal: budgets.minimal, low: budgets.low, medium: budgets.medium, high: budgets.high},
    compaction: {
      enabled: source.getCompactionEnabled(),
      reserveTokens: source.getCompactionReserveTokens(),
      keepRecentTokens: source.getCompactionKeepRecentTokens(),
    },
    retry: {
      enabled: source.getRetryEnabled(),
      maxRetries: source.getRetrySettings().maxRetries,
      baseDelayMs: source.getRetrySettings().baseDelayMs,
      provider: {timeoutMs: providerRetry.timeoutMs, maxRetries: providerRetry.maxRetries, maxRetryDelayMs: providerRetry.maxRetryDelayMs},
    },
    transport: source.getTransport(),
    httpIdleTimeoutMs: source.getHttpIdleTimeoutMs(),
    websocketConnectTimeoutMs: source.getWebSocketConnectTimeoutMs(),
    shellPath: source.getShellPath(),
    shellCommandPrefix: source.getShellCommandPrefix(),
    images: {autoResize: source.getImageAutoResize()},
    enableInstallTelemetry: source.getEnableInstallTelemetry(),
  });
}
