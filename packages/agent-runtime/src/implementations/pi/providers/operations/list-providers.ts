import {Effect} from "effect";
import {AgentProvidersListError} from "@pi-desktop/contracts/providers";
import type {AgentProviderAuthSource, IAgentProvider} from "@pi-desktop/contracts/providers";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {EXTERNAL_AUTH_PROVIDERS} from "@pi-desktop/agent-runtime/implementations/pi/providers/constants";
import {errorMessage} from "@pi-desktop/agent-runtime/implementations/pi/providers/lib/provider-errors";

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
    const piSdk = yield* PiSdkService;

    return yield* Effect.try({
      try: () => {
        piSdk.modelRegistry.refresh();
        piSdk.authStorage.reload();

        const oauthProviderIds = new Set(piSdk.authStorage.getOAuthProviders().map((provider) => provider.id));
        const modelProviderIds = new Set(piSdk.modelRegistry.getAll().map((model) => model.provider));
        const providerIds = new Set([...modelProviderIds, ...oauthProviderIds]);

        return Array.from(providerIds)
          .filter((providerId) => !EXTERNAL_AUTH_PROVIDERS.has(providerId))
          .map<IAgentProvider>((providerId) => {
            const status = piSdk.modelRegistry.getProviderAuthStatus(providerId);
            return {
              id: providerId,
              name: piSdk.modelRegistry.getProviderDisplayName(providerId),
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
