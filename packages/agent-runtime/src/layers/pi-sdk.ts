import {createAgentSession, ModelRuntime, SessionManager} from "@earendil-works/pi-coding-agent";
import type {ResourceLoader, SessionInfo} from "@earendil-works/pi-coding-agent";
import {Context, Effect, Layer} from "effect";
import {CustomPiResourceLoader} from "@supernova/agent-runtime/layers/pi-config";

export type PiSessionInfo = SessionInfo;

export interface PiSdkServiceShape {
  readonly createAgentSession: typeof createAgentSession;
  readonly createResourceLoader: (input: {readonly projectPath: string}) => ResourceLoader;
  readonly modelRuntime: ModelRuntime;
  readonly SessionManager: typeof SessionManager;
}

/** Pi SDK runtime dependencies. */
export class PiSdkService extends Context.Service<PiSdkService, PiSdkServiceShape>()("supernova/agent-runtime/PiSdkService") {}

export const PiSdkLive = Layer.effect(
  PiSdkService,
  Effect.gen(function* () {
    const modelRuntime = yield* Effect.promise(() => ModelRuntime.create());

    return {
      createAgentSession,
      createResourceLoader: ({projectPath}) => new CustomPiResourceLoader(projectPath),
      modelRuntime,
      SessionManager,
    } satisfies PiSdkServiceShape;
  })
);
