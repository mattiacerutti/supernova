import {AuthStorage, ModelRegistry} from "@mariozechner/pi-coding-agent";
import {Context, Layer} from "effect";

export const authStorage = AuthStorage.create();
export const modelRegistry = ModelRegistry.create(authStorage);

export interface IPiProviderSdkService {
  readonly authStorage: typeof authStorage;
  readonly modelRegistry: typeof modelRegistry;
}

export class PiProviderSdkService extends Context.Service<PiProviderSdkService, IPiProviderSdkService>()("pi-desktop/agent-runtime/PiProviderSdkService") {}

export const PiProviderSdkLive = Layer.succeed(PiProviderSdkService, {
  authStorage,
  modelRegistry,
});
