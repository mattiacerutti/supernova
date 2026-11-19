import type {Provider, ProviderAuthType} from "@supernova/contracts/services/providers/schemas";
import {normalizeAuthSource} from "@supernova/agent-runtime/features/providers/lib/auth-source";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

export async function listProviders(sdk: Pick<PiSdk, "modelRuntime">): Promise<readonly Provider[]> {
  const {modelRuntime} = sdk;
  await modelRuntime.refresh({allowNetwork: false});
  const storedProviderIds = new Set((await modelRuntime.listCredentials()).map((credential) => credential.providerId));

  return modelRuntime
    .getProviders()
    .map<Provider>((provider) => {
      const status = modelRuntime.getProviderAuthStatus(provider.id);
      const authTypes: ProviderAuthType[] = [];
      if (provider.auth.apiKey?.login) authTypes.push("api_key");
      else if (provider.auth.apiKey) authTypes.push("external");
      if (provider.auth.oauth) authTypes.push("oauth");

      const source = normalizeAuthSource(status.source);
      return {
        id: provider.id,
        name: provider.name,
        ...(source === undefined ? {} : {source}),
        ...(status.label === undefined ? {} : {sourceLabel: status.label}),
        authTypes,
        connected: status.configured,
        disconnectable: storedProviderIds.has(provider.id),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
