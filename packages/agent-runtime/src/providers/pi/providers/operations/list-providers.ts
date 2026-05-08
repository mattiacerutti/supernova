import {Effect} from "effect";
import {AgentProvidersListError} from "@pi-desktop/contracts/providers";
import type {AgentProviderAuthSource, IAgentProvider} from "@pi-desktop/contracts/providers";
import {EXTERNAL_AUTH_PROVIDERS} from "@pi-desktop/agent-runtime/providers/pi/providers/constants";
import {PiProviderSdkService} from "@pi-desktop/agent-runtime/providers/pi/providers/pi-provider-sdk";
import {errorMessage} from "@pi-desktop/agent-runtime/providers/pi/providers/lib/provider-errors";

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
  return Effect.gen(function* () {
    const providerSdk = yield* PiProviderSdkService;

    return yield* Effect.try({
      try: () => {
        providerSdk.modelRegistry.refresh();
        providerSdk.authStorage.reload();

        const oauthProviderIds = new Set(providerSdk.authStorage.getOAuthProviders().map((provider) => provider.id));
        const modelProviderIds = new Set(providerSdk.modelRegistry.getAll().map((model) => model.provider));
        const providerIds = new Set([...modelProviderIds, ...oauthProviderIds]);

        return Array.from(providerIds)
          .filter((providerId) => !EXTERNAL_AUTH_PROVIDERS.has(providerId))
          .map<IAgentProvider>((providerId) => {
            const status = providerSdk.modelRegistry.getProviderAuthStatus(providerId);
            return {
              id: providerId,
              name: providerSdk.modelRegistry.getProviderDisplayName(providerId),
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
  });
}
