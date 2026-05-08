import {Effect} from "effect";
import {AgentProviderApiKeySetError} from "@pi-desktop/contracts/providers";
import {PiProviderSdkService} from "@pi-desktop/agent-runtime/providers/pi/providers/pi-provider-sdk";
import {errorMessage} from "@pi-desktop/agent-runtime/providers/pi/providers/lib/provider-errors";

export function setProviderApiKey(providerId: string, apiKey: string) {
  return Effect.gen(function* () {
    const providerSdk = yield* PiProviderSdkService;

    return yield* Effect.try({
      try: () => {
        const key = apiKey.trim();
        if (!key) throw new Error("API key is required.");

        providerSdk.authStorage.set(providerId, {type: "api_key", key});
        providerSdk.modelRegistry.refresh();
        return {providerId};
      },
      catch: (cause) => new AgentProviderApiKeySetError({cause, message: errorMessage(cause, "Failed to save provider API key.")}),
    });
  });
}
