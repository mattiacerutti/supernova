import type {ModelReference} from "@supernova/contracts/sessions/schemas";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

/** Returns the context window for a selected model, or 0 when unavailable. */
export function resolveModelContextWindow(sdk: Pick<PiSdk, "modelRuntime">, modelReference: ModelReference | undefined): number {
  if (!modelReference) return 0;
  return sdk.modelRuntime.getModel(modelReference.providerId, modelReference.id)?.contextWindow ?? 0;
}
