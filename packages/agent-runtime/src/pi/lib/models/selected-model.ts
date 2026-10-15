import type {ModelReference} from "@supernova/contracts/services/sessions/schemas";
import type {PiModel, PiSdk} from "@supernova/agent-runtime/pi/sdk";

/**
 * The full catalog, not the availability snapshot, which lags provider registration and would reject just-installed
 * models. Credentials are checked at send.
 */
export function findSelectedModel(sdk: Pick<PiSdk, "modelRuntime">, modelReference: ModelReference): PiModel {
  const model = sdk.modelRuntime.getModel(modelReference.providerId, modelReference.id);
  if (!model) throw new Error("Selected model is not available.");
  return model;
}
