import {Effect} from "effect";
import {AgentProviderApiKeySetError} from "@pi-desktop/contracts/providers/procedures";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {errorMessage} from "@pi-desktop/agent-runtime/implementations/pi/providers/lib/provider-errors";

export function setProviderApiKey(providerId: string, apiKey: string) {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return yield* Effect.try({
      try: () => {
        const key = apiKey.trim();
        if (!key) throw new Error("API key is required.");

        piSdk.authStorage.set(providerId, {type: "api_key", key});
        piSdk.modelRegistry.refresh();
        return {providerId};
      },
      catch: (cause) => new AgentProviderApiKeySetError({cause, message: errorMessage(cause, "Failed to save provider API key.")}),
    });
  });
}
