import {Effect} from "effect";
import {AgentProviderApiKeySetError} from "@pi-desktop/contracts/providers";
import {authStorage, errorMessage, modelRegistry} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/pi-provider-runtime";

export function setProviderApiKey(providerId: string, apiKey: string) {
  return Effect.try({
    try: () => {
      const key = apiKey.trim();
      if (!key) throw new Error("API key is required.");

      authStorage.set(providerId, {type: "api_key", key});
      modelRegistry.refresh();
      return {providerId};
    },
    catch: (cause) => new AgentProviderApiKeySetError({cause, message: errorMessage(cause, "Failed to save provider API key.")}),
  });
}
