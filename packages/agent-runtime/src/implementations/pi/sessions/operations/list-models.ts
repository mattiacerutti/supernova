import {Effect} from "effect";
import {ListModelsError} from "@supernova/contracts/sessions/procedures";
import {PiModelCatalog} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-model-catalog";
import {toAgentModelDetails} from "@supernova/agent-runtime/implementations/pi/sessions/lib/models/model-mapper";

/** Lists available Pi models mapped into shared model details. */
export function listModels() {
  return Effect.gen(function* () {
    const modelCatalog = yield* PiModelCatalog;

    return yield* Effect.tryPromise({
      try: async () => {
        modelCatalog.refreshAuthAndModels();
        const models = modelCatalog.getAvailableModels();

        return models.map((model) => toAgentModelDetails(model, modelCatalog.getProviderDisplayName(model.provider)));
      },
      catch: (cause) => new ListModelsError({cause, message: cause instanceof Error ? cause.message : "Failed to list session models."}),
    });
  });
}
