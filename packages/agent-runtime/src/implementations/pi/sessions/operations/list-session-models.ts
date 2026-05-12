import {Effect} from "effect";
import {AgentSessionModelsListError} from "@pi-desktop/contracts/sessions/procedures";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {toAgentModelDetails} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/model-mapper";

export function listSessionModels() {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return yield* Effect.tryPromise({
      try: async () => {
        piSdk.authStorage.reload();
        piSdk.modelRegistry.refresh();
        const models = await piSdk.modelRegistry.getAvailable();

        return models.map((model) => toAgentModelDetails(model, piSdk.modelRegistry.getProviderDisplayName(model.provider)));
      },
      catch: (cause) => new AgentSessionModelsListError({cause, message: cause instanceof Error ? cause.message : "Failed to list session models."}),
    });
  });
}
