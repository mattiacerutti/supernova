import type {AgentSession} from "@earendil-works/pi-coding-agent";
import {SettingsManager} from "@earendil-works/pi-coding-agent";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";
import {createPiCustomTools} from "@supernova/agent-runtime/features/session-runtime/tools/tools";
import type {PiSdk, PiSessionManager} from "@supernova/agent-runtime/pi/sdk";

/** Loads a session-local snapshot of the file settings Supernova supports, without writing back to disk. */
export function loadRuntimeSettings(cwd: string, agentDir?: string): SettingsManager {
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

export interface AgentSessionFactory {
  readonly createAgentSession: (input: {readonly cwd: string; readonly sessionManager: PiSessionManager}) => Promise<{readonly session: AgentSession}>;
}

/** Creates Pi agent sessions with Supernova's tools and settings. */
export function createAgentSessionFactory(sdk: Pick<PiSdk, "createAgentSession" | "createResourceLoader" | "modelRuntime">): AgentSessionFactory {
  return {
    createAgentSession: async ({cwd, sessionManager}) => {
      const settingsManager = loadRuntimeSettings(cwd);
      const resourceLoader = sdk.createResourceLoader({projectPath: cwd});
      await resourceLoader.reload();
      const extensionErrors = resourceLoader.getExtensions().errors;
      if (extensionErrors.length > 0) throw new Error(extensionErrors.map(({path, error}) => `${path}: ${error}`).join("\n"));

      const created = await sdk.createAgentSession({
        cwd,
        customTools: createPiCustomTools(),
        modelRuntime: sdk.modelRuntime,
        resourceLoader,
        sessionManager,
        settingsManager,
      });
      created.session.setActiveToolsByName([...new Set([...created.session.getActiveToolNames(), "web_fetch"])]);
      return created;
    },
  };
}
