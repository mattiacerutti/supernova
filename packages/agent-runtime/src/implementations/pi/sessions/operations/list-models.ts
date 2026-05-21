import {Effect} from "effect";
import {ListModelsError} from "@supernova/contracts/sessions/procedures";
import {PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import {toAgentModelDetails} from "@supernova/agent-runtime/implementations/pi/sessions/lib/models/model-mapper";

/** Lists available Pi models mapped into shared model details. */
export function listModels() {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return yield* Effect.tryPromise({
      try: async () => {
        piSdk.authStorage.reload();
        piSdk.modelRegistry.refresh();
        const models = await piSdk.modelRegistry.getAvailable();

        return models.map((model) => toAgentModelDetails(model, piSdk.modelRegistry.getProviderDisplayName(model.provider)));
      },
      catch: (cause) => new ListModelsError({cause, message: cause instanceof Error ? cause.message : "Failed to list session models."}),
    });
  });
}
