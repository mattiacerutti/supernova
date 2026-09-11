import type {AgentSession} from "@earendil-works/pi-coding-agent";
import {Context, Effect, Layer} from "effect";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import type {PiSessionManager} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";
import {createPiCustomTools} from "@supernova/agent-runtime/layers/session-runtime/internal/tools/create-pi-custom-tools";
import {loadPiRuntimeSettings} from "@supernova/agent-runtime/layers/session-runtime/lib/pi-runtime-settings";

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
        const settingsManager = loadPiRuntimeSettings(cwd);
        const resourceLoader = piSdk.createResourceLoader({projectPath: cwd});
        await resourceLoader.reload();
        const extensionErrors = resourceLoader.getExtensions().errors;
        if (extensionErrors.length > 0) throw new Error(extensionErrors.map(({path, error}) => `${path}: ${error}`).join("\n"));

        const created = await piSdk.createAgentSession({
          cwd,
          customTools: createPiCustomTools(),
          modelRuntime: piSdk.modelRuntime,
          resourceLoader,
          sessionManager,
          settingsManager,
        });
        created.session.setActiveToolsByName([...new Set([...created.session.getActiveToolNames(), "web_fetch"])]);
        return created;
      },
    };
  })
);
