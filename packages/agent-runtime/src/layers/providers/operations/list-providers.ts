import {Effect} from "effect";
import {ProvidersListError} from "@supernova/contracts/providers/procedures";
import type {ProviderAuthSource, Provider, ProviderAuthType} from "@supernova/contracts/providers/schemas";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import {errorMessage} from "@supernova/agent-runtime/layers/providers/lib/provider-errors";

/** Maps Pi provider auth source values into shared provider auth source values. */
function normalizeSource(source: string | undefined): ProviderAuthSource | undefined {
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

/** Lists configured and configurable Pi providers with auth metadata. */
export function listProviders() {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return yield* Effect.tryPromise({
      try: async () => {
        await piSdk.modelRuntime.refresh({allowNetwork: false});
        const storedProviderIds = new Set((await piSdk.modelRuntime.listCredentials()).map((credential) => credential.providerId));

        return piSdk.modelRuntime
          .getProviders()
          .map<Provider>((provider) => {
            const status = piSdk.modelRuntime.getProviderAuthStatus(provider.id);
            const authTypes: ProviderAuthType[] = [];
            if (provider.auth.apiKey?.login) authTypes.push("api_key");
            else if (provider.auth.apiKey) authTypes.push("external");
            if (provider.auth.oauth) authTypes.push("oauth");

            return {
              id: provider.id,
              name: provider.name,
              source: normalizeSource(status.source),
              sourceLabel: status.label,
              authTypes,
              connected: status.configured,
              disconnectable: storedProviderIds.has(provider.id),
            };
          })
          .sort((left, right) => left.name.localeCompare(right.name));
      },
      catch: (cause) => new ProvidersListError({cause, message: errorMessage(cause, "Failed to list providers.")}),
    });
  });
}
