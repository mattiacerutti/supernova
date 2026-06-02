import type {ModelReference} from "@supernova/contracts/sessions/schemas";
import type {PiModel, PiModelCatalogShape} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";

/** Finds the selected Pi model, failing the command before any provider work starts. */
export function findSelectedModel(modelCatalog: PiModelCatalogShape, modelReference: ModelReference): PiModel {
  const model = modelCatalog.getAvailableModels().find((candidate) => candidate.provider === modelReference.providerId && candidate.id === modelReference.id);
  if (!model) throw new Error("Selected model is not available.");
  return model;
}
