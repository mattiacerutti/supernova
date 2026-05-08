import {Effect} from "effect";
import {AgentProvidersListError} from "@pi-desktop/contracts/providers";
import type {AgentProviderAuthSource, IAgentProvider} from "@pi-desktop/contracts/providers";
import {authStorage, errorMessage, EXTERNAL_AUTH_PROVIDERS, modelRegistry} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/pi-provider-runtime";

function normalizeSource(source: string | undefined): AgentProviderAuthSource | undefined {
  switch (source) {
    case "stored":
    case "runtime":
    case "environment":
      return source;
    case "models_json_key":
    case "models_json_command":
      return "config";
    case "fallback":
      return "external";
    default:
      return source ? "unknown" : undefined;
  }
}

export function listProviders() {
  return Effect.try({
    try: () => {
      modelRegistry.refresh();
      authStorage.reload();

      const oauthProviderIds = new Set(authStorage.getOAuthProviders().map((provider) => provider.id));
      const modelProviderIds = new Set(modelRegistry.getAll().map((model) => model.provider));
      const providerIds = new Set([...modelProviderIds, ...oauthProviderIds]);

      return Array.from(providerIds)
        .filter((providerId) => !EXTERNAL_AUTH_PROVIDERS.has(providerId))
        .map<IAgentProvider>((providerId) => {
          const status = modelRegistry.getProviderAuthStatus(providerId);
          return {
            id: providerId,
            name: modelRegistry.getProviderDisplayName(providerId),
            source: normalizeSource(status.source),
            sourceLabel: status.label,
            authTypes: oauthProviderIds.has(providerId) ? ["api_key", "oauth"] : ["api_key"],
            connected: status.configured || status.source !== undefined,
            disconnectable: status.source === "stored",
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    catch: (cause) => new AgentProvidersListError({cause, message: errorMessage(cause, "Failed to list providers.")}),
  });
}
