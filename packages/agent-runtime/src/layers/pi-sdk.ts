import {AuthStorage, createAgentSession, ModelRegistry, SessionManager} from "@earendil-works/pi-coding-agent";
import type {ResourceLoader, SessionInfo} from "@earendil-works/pi-coding-agent";
import {completeSimple} from "@earendil-works/pi-ai";
import {Context, Effect, Layer} from "effect";
import {CustomPiResourceLoader} from "@supernova/agent-runtime/layers/pi-config";

export type PiSessionInfo = SessionInfo;

export interface PiSdkServiceShape {
  readonly authStorage: ReturnType<typeof AuthStorage.create>;
  readonly completeSimple: typeof completeSimple;
  readonly createAgentSession: typeof createAgentSession;
  readonly createResourceLoader: (input: {readonly projectPath: string}) => ResourceLoader;
  readonly modelRegistry: ReturnType<typeof ModelRegistry.create>;
  readonly SessionManager: typeof SessionManager;
}

/** Pi SDK runtime dependencies. */
export class PiSdkService extends Context.Service<PiSdkService, PiSdkServiceShape>()("supernova/agent-runtime/PiSdkService") {}

export const PiSdkLive = Layer.effect(
  PiSdkService,
  Effect.sync(() => {
    const authStorage = AuthStorage.create();
    const modelRegistry = ModelRegistry.create(authStorage);

    return {
      authStorage,
      completeSimple,
      createAgentSession,
      createResourceLoader: ({projectPath}) => new CustomPiResourceLoader(projectPath),
      modelRegistry,
      SessionManager,
    } satisfies PiSdkServiceShape;
  })
);
