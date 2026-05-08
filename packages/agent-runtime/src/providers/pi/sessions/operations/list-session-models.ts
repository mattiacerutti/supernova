import {Effect} from "effect";
import {AgentSessionModelsListError} from "@pi-desktop/contracts/sessions";
import {PiProviderSdkService} from "@pi-desktop/agent-runtime/providers/pi/providers/pi-provider-sdk";
import {toAgentModelDetails} from "@pi-desktop/agent-runtime/providers/pi/sessions/lib/model-mapper";

export function listSessionModels() {
  return Effect.gen(function* () {
    const providerSdk = yield* PiProviderSdkService;

    return yield* Effect.tryPromise({
      try: async () => {
        providerSdk.authStorage.reload();
        providerSdk.modelRegistry.refresh();
        const models = await providerSdk.modelRegistry.getAvailable();

        return models.map((model) => toAgentModelDetails(model, providerSdk.modelRegistry.getProviderDisplayName(model.provider)));
      },
      catch: (cause) => new AgentSessionModelsListError({cause, message: cause instanceof Error ? cause.message : "Failed to list session models."}),
    });
  });
}
