import {Context, Effect, Layer} from "effect";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import type {PiSdkServiceShape} from "@supernova/agent-runtime/layers/pi-sdk";

export type PiModel = ReturnType<PiSdkServiceShape["modelRuntime"]["getModels"]>[number];

export interface PiModelCatalogShape {
  /** Every model from every registered provider, regardless of credential state. */
  readonly getModel: (providerId: string, modelId: string) => PiModel | undefined;
  /** Models whose provider passed the last auth sweep; used for discovery, not for gating selection. */
  readonly getAvailableModels: () => readonly PiModel[];
  readonly getProviderDisplayName: (providerId: string) => string;
  /** Reapplies cached provider catalogs without network access; needed after extension providers re-register. */
  readonly restoreModels: () => Promise<void>;
  readonly refreshAuthAndModels: () => Promise<void>;
}

/** Private Pi model catalog capability used by session operations. */
export class PiModelCatalog extends Context.Service<PiModelCatalog, PiModelCatalogShape>()("supernova/agent-runtime/PiModelCatalog") {}

// TODO: Revisit ModelRuntime ownership: model callers use this capability while provider callers access PiSdkService directly. Consider separate model and provider capabilities so operations do not mix abstraction levels.
export const PiModelCatalogLive = Layer.effect(
  PiModelCatalog,
  Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return {
      getModel: (providerId, modelId) => piSdk.modelRuntime.getModel(providerId, modelId),
      getAvailableModels: () => piSdk.modelRuntime.getAvailableSnapshot(),
      getProviderDisplayName: (providerId) => piSdk.modelRuntime.getProvider(providerId)?.name ?? providerId,
      restoreModels: async () => {
        await piSdk.modelRuntime.refresh({allowNetwork: false});
      },
      refreshAuthAndModels: async () => {
        await piSdk.modelRuntime.refresh({allowNetwork: true, signal: AbortSignal.timeout(15_000)});
        const error = piSdk.modelRuntime.getError();
        if (error) throw new Error(error);
      },
    };
  })
);
