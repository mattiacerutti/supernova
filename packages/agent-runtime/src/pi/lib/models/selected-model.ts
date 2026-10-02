import type {ModelReference} from "@supernova/contracts/sessions/schemas";
import type {PiModel, PiSdk} from "@supernova/agent-runtime/pi/sdk";

/**
 * Finds the selected Pi model in the full catalog, failing the command before any provider work starts.
 *
 * This deliberately does not consult the availability snapshot: that snapshot lags behind provider
 * registration until an auth sweep runs, so gating on it rejects models that were just installed.
 * Credentials are checked separately when a message is sent, as the old SDK's `setModel` did.
 */
export function findSelectedModel(sdk: Pick<PiSdk, "modelRuntime">, modelReference: ModelReference): PiModel {
  const model = sdk.modelRuntime.getModel(modelReference.providerId, modelReference.id);
  if (!model) throw new Error("Selected model is not available.");
  return model;
}
