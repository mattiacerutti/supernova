import type {AgentSession} from "@earendil-works/pi-coding-agent";
import {Context, Effect, Layer} from "effect";
import {PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import type {PiSessionManager} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-session-store";

export interface PiAgentSessionFactoryShape {
  readonly createAgentSession: (input: {readonly cwd: string; readonly sessionManager: PiSessionManager}) => Promise<{readonly session: AgentSession}>;
}

/** Private capability for creating Pi agent sessions. */
export class PiAgentSessionFactory extends Context.Service<PiAgentSessionFactory, PiAgentSessionFactoryShape>()("supernova/agent-runtime/PiAgentSessionFactory") {}

export const PiAgentSessionFactoryLive = Layer.effect(
  PiAgentSessionFactory,
  Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return {
      createAgentSession: ({cwd, sessionManager}) =>
        piSdk.createAgentSession({
          authStorage: piSdk.authStorage,
          cwd,
          modelRegistry: piSdk.modelRegistry,
          sessionManager,
        }),
    };
  })
);
