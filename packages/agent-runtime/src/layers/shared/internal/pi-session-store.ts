import type {SessionInfo} from "@earendil-works/pi-coding-agent";
import {Context, Effect, Layer} from "effect";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import type {PiSdkServiceShape} from "@supernova/agent-runtime/layers/pi-sdk";

export type PiSessionInfo = SessionInfo;
export type PiSessionManager = ReturnType<PiSdkServiceShape["SessionManager"]["open"]>;

export interface OpenedPiSession {
  readonly info: PiSessionInfo;
  readonly manager: PiSessionManager;
}

export interface PiSessionStoreShape {
  readonly createSessionManager: (projectPath: string) => PiSessionManager;
  readonly openSessionById: (sessionId: string) => Promise<OpenedPiSession>;
}

/** Private Pi session storage capability used by the Pi sessions implementation. */
export class PiSessionStore extends Context.Service<PiSessionStore, PiSessionStoreShape>()("supernova/agent-runtime/PiSessionStore") {}

export const PiSessionStoreLive = Layer.effect(
  PiSessionStore,
  Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return {
      createSessionManager: (projectPath) => piSdk.SessionManager.create(projectPath),
      openSessionById: async (sessionId) => {
        const sessions = await piSdk.SessionManager.listAll();
        const info = sessions.find((candidate) => candidate.id === sessionId);
        if (!info) throw new Error("Session not found.");
        return {info, manager: piSdk.SessionManager.open(info.path)};
      },
    };
  })
);
