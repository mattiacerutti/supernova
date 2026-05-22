import {Context, Effect, Layer} from "effect";
import {PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import type {PiSdkServiceShape} from "@supernova/agent-runtime/implementations/pi/pi-sdk";

export type PiModel = ReturnType<PiSdkServiceShape["modelRegistry"]["getAvailable"]>[number];

export interface PiModelCatalogShape {
  readonly getAvailableModels: () => readonly PiModel[];
  readonly getProviderDisplayName: (providerId: string) => string;
  readonly refreshAuthAndModels: () => void;
}

/** Private Pi model catalog capability used by session operations. */
export class PiModelCatalog extends Context.Service<PiModelCatalog, PiModelCatalogShape>()("supernova/agent-runtime/PiModelCatalog") {}

export const PiModelCatalogLive = Layer.effect(
  PiModelCatalog,
  Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return {
      getAvailableModels: () => piSdk.modelRegistry.getAvailable(),
      getProviderDisplayName: (providerId) => piSdk.modelRegistry.getProviderDisplayName(providerId),
      refreshAuthAndModels: () => {
        piSdk.authStorage.reload();
        piSdk.modelRegistry.refresh();
      },
    };
  })
);
