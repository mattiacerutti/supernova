import type {ModelReference} from "@supernova/contracts/sessions/schemas";
import type {PiModel, PiModelCatalogShape} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";

/**
 * Finds the selected Pi model in the full catalog, failing the command before any provider work starts.
 *
 * This deliberately does not consult the availability snapshot: that snapshot lags behind provider
 * registration until an auth sweep runs, so gating on it rejects models that were just installed.
 * Like Pi's own `AgentSession.setModel`, credential state is checked when the model is applied.
 */
export function findSelectedModel(modelCatalog: PiModelCatalogShape, modelReference: ModelReference): PiModel {
  const model = modelCatalog.getModel(modelReference.providerId, modelReference.id);
  if (!model) throw new Error("Selected model is not available.");
  return model;
}
