import {createAgentSession, SessionManager} from "@mariozechner/pi-coding-agent";
import type {SessionInfo} from "@mariozechner/pi-coding-agent";
import {Context, Layer} from "effect";

export type PiSessionInfo = SessionInfo;

export interface IPiSessionSdkService {
  readonly createAgentSession: typeof createAgentSession;
  readonly listSessions: () => Promise<readonly PiSessionInfo[]>;
  readonly openSessionManager: typeof SessionManager.open;
}

export class PiSessionSdkService extends Context.Service<PiSessionSdkService, IPiSessionSdkService>()("pi-desktop/agent-runtime/PiSessionSdkService") {}

export const PiSessionSdkLive = Layer.succeed(PiSessionSdkService, {
  createAgentSession,
  listSessions: () => SessionManager.listAll(),
  openSessionManager: SessionManager.open,
});
