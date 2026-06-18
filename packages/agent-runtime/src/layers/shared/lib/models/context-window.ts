import type {ModelReference} from "@supernova/contracts/sessions/schemas";
import type {PiModelCatalogShape} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";

/** Returns the context window for a selected model, or 0 when unavailable. */
export function resolveModelContextWindow(modelCatalog: PiModelCatalogShape, model: ModelReference | undefined): number {
  if (!model) return 0;
  return modelCatalog.getAvailableModels().find((candidate) => candidate.provider === model.providerId && candidate.id === model.id)?.contextWindow ?? 0;
}
