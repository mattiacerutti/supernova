import {AuthStorage, createAgentSession, ModelRegistry, SessionManager} from "@earendil-works/pi-coding-agent";
import type {SessionInfo} from "@earendil-works/pi-coding-agent";
import {Context, Layer} from "effect";

export const authStorage = AuthStorage.create();
export const modelRegistry = ModelRegistry.create(authStorage);

export type PiSessionInfo = SessionInfo;

export interface PiSdkServiceShape {
  readonly authStorage: typeof authStorage;
  readonly createAgentSession: typeof createAgentSession;
  readonly modelRegistry: typeof modelRegistry;
  readonly SessionManager: typeof SessionManager;
}

export class PiSdkService extends Context.Service<PiSdkService, PiSdkServiceShape>()("supernova/agent-runtime/PiSdkService") {}

export const PiSdkLive = Layer.succeed(PiSdkService, {
  authStorage,
  createAgentSession,
  modelRegistry,
  SessionManager,
});
