import {Effect} from "effect";
import {ListModelsError} from "@supernova/contracts/sessions/procedures";
import {PiResourceCatalog} from "@supernova/agent-runtime/layers/shared/internal/pi-resource-catalog";
import {PiModelCatalog} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";
import {toAgentModelDetails} from "@supernova/agent-runtime/layers/sessions/lib/models/model-mapper";

/** Lists available Pi models mapped into shared model details. */
export function listModels(projectPath: string) {
  return Effect.gen(function* () {
    const modelCatalog = yield* PiModelCatalog;
    const resourceCatalog = yield* PiResourceCatalog;

    return yield* Effect.tryPromise({
      try: async () => {
        await resourceCatalog.initialize(projectPath);
        await modelCatalog.refreshAuthAndModels();
        const models = modelCatalog.getAvailableModels();

        return models.map((model) => toAgentModelDetails(model, modelCatalog.getProviderDisplayName(model.provider)));
      },
      catch: (cause) => new ListModelsError({cause, message: cause instanceof Error ? cause.message : "Failed to list session models."}),
    });
  });
}
