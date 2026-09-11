import {SettingsManager} from "@earendil-works/pi-coding-agent";

/** Loads a session-local snapshot of the file settings Supernova supports, without writing back to disk. */
export function loadPiRuntimeSettings(cwd: string, agentDir?: string): SettingsManager {
  // Match the existing resource loader's project policy; unsupported trust/resource settings stay isolated.
  const source = SettingsManager.create(cwd, agentDir, {projectTrusted: true});
  const errors = source.drainErrors();
  if (errors.length > 0) {
    throw new Error(`Could not load ${errors.map(({scope}) => scope).join(" and ")} settings.json. Check that the files are readable and contain valid JSON.`);
  }

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
