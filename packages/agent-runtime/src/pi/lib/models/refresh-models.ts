import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

export async function refreshAuthAndModels(sdk: Pick<PiSdk, "modelRuntime">): Promise<void> {
  await sdk.modelRuntime.refresh({allowNetwork: true, signal: AbortSignal.timeout(15_000)});
  const error = sdk.modelRuntime.getError();
  if (error) throw new Error(error);
}
