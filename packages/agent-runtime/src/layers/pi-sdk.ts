import {createAgentSession, createAgentSessionServices, ModelRuntime, SessionManager} from "@earendil-works/pi-coding-agent";
import type {ResourceLoader, SessionInfo} from "@earendil-works/pi-coding-agent";
import {Context, Effect, Layer} from "effect";
import {createPiResourceLoaderOptions, CustomPiResourceLoader} from "@supernova/agent-runtime/layers/pi-config";

export type PiSessionInfo = SessionInfo;

export interface PiSdkServiceShape {
  readonly createAgentSession: typeof createAgentSession;
  readonly createResourceLoader: (input: {readonly projectPath: string}) => ResourceLoader;
  readonly loadResourceLoader: (input: {readonly projectPath: string}) => Promise<ResourceLoader>;
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
      loadResourceLoader: async ({projectPath}) => {
        const options = createPiResourceLoaderOptions(projectPath);
        const {resourceLoader, diagnostics} = await createAgentSessionServices({
          cwd: projectPath,
          agentDir: options.agentDir,
          settingsManager: options.settingsManager,
          modelRuntime,
          resourceLoaderOptions: options,
        });
        const errors = diagnostics.filter((diagnostic) => diagnostic.type === "error");
        if (errors.length > 0) throw new Error(errors.map((diagnostic) => diagnostic.message).join("\n"));
        return resourceLoader;
      },
      modelRuntime,
      SessionManager,
    } satisfies PiSdkServiceShape;
  })
);
