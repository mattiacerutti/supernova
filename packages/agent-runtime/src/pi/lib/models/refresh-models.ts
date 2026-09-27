import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

/** Reapplies cached provider catalogs without network access; needed after extension providers re-register. */
export async function restoreModels(sdk: Pick<PiSdk, "modelRuntime">): Promise<void> {
  await sdk.modelRuntime.refresh({allowNetwork: false});
}

/** Re-checks provider credentials and refreshes model lists over the network, failing on a runtime error. */
export async function refreshAuthAndModels(sdk: Pick<PiSdk, "modelRuntime">): Promise<void> {
  await sdk.modelRuntime.refresh({allowNetwork: true, signal: AbortSignal.timeout(15_000)});
  const error = sdk.modelRuntime.getError();
  if (error) throw new Error(error);
}
