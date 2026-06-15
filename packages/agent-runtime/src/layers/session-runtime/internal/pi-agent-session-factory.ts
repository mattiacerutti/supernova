import {SettingsManager} from "@earendil-works/pi-coding-agent";
import type {AgentSession} from "@earendil-works/pi-coding-agent";
import {Context, Effect, Layer} from "effect";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import type {PiSessionManager} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";
import {createPiCustomTools} from "@supernova/agent-runtime/layers/session-runtime/internal/tools/create-pi-custom-tools";

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
      createAgentSession: async ({cwd, sessionManager}) => {
        const resourceLoader = piSdk.createResourceLoader({projectPath: cwd});
        await resourceLoader.reload();

        const created = await piSdk.createAgentSession({
          authStorage: piSdk.authStorage,
          cwd,
          customTools: createPiCustomTools(),
          modelRegistry: piSdk.modelRegistry,
          resourceLoader,
          sessionManager,
          settingsManager: SettingsManager.inMemory(),
        });
        created.session.setActiveToolsByName([...new Set([...created.session.getActiveToolNames(), "web_fetch"])]);
        return created;
      },
    };
  })
);
