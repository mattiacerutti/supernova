import {AuthStorage, createAgentSession, ModelRegistry, SessionManager} from "@earendil-works/pi-coding-agent";
import type {ResourceLoader, SessionInfo} from "@earendil-works/pi-coding-agent";
import {completeSimple} from "@earendil-works/pi-ai";
import {Context, Layer} from "effect";
import {CustomPiResourceLoader} from "@supernova/agent-runtime/implementations/pi/pi-config";

export const authStorage = AuthStorage.create();
export const modelRegistry = ModelRegistry.create(authStorage);

export type PiSessionInfo = SessionInfo;

export interface PiSdkServiceShape {
  readonly authStorage: typeof authStorage;
  readonly completeSimple: typeof completeSimple;
  readonly createAgentSession: typeof createAgentSession;
  readonly createResourceLoader: (input: {readonly projectPath: string}) => ResourceLoader;
  readonly modelRegistry: typeof modelRegistry;
  readonly SessionManager: typeof SessionManager;
}

/** Pi SDK runtime dependencies. */
export class PiSdkService extends Context.Service<PiSdkService, PiSdkServiceShape>()("supernova/agent-runtime/PiSdkService") {}

export const PiSdkLive = Layer.succeed(PiSdkService, {
  authStorage,
  completeSimple,
  createAgentSession,
  createResourceLoader: ({projectPath}) => new CustomPiResourceLoader(projectPath),
  modelRegistry,
  SessionManager,
});
