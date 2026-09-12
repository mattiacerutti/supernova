import type {ModelReference} from "@supernova/contracts/sessions/schemas";
import type {PiModelCatalogShape} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";

/** Returns the context window for a selected model, or 0 when unavailable. */
export function resolveModelContextWindow(modelCatalog: PiModelCatalogShape, modelReference: ModelReference | undefined): number {
  if (!modelReference) return 0;
  return modelCatalog.getModel(modelReference.providerId, modelReference.id)?.contextWindow ?? 0;
}
