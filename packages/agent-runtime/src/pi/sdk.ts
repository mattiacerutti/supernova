import {createAgentSession, createAgentSessionServices, ModelRuntime, SessionManager} from "@earendil-works/pi-coding-agent";
import type {ResourceLoader, SessionInfo} from "@earendil-works/pi-coding-agent";
import {createPiResourceLoaderOptions, CustomPiResourceLoader} from "@supernova/agent-runtime/pi/config/resource-loader";

export type PiSessionInfo = SessionInfo;
export type PiSessionManager = ReturnType<typeof SessionManager.open>;
export type PiModel = ReturnType<ModelRuntime["getModels"]>[number];

/** The Pi SDK surface the rest of the runtime uses. Tests substitute an in-memory `SessionManager` and a faux `ModelRuntime`. */
export interface PiSdk {
  readonly createAgentSession: typeof createAgentSession;
  readonly createResourceLoader: (input: {readonly projectPath: string}) => ResourceLoader;
  readonly loadResourceLoader: (input: {readonly projectPath: string}) => Promise<ResourceLoader>;
  readonly modelRuntime: ModelRuntime;
  readonly SessionManager: typeof SessionManager;
}

/** Connects to the real Pi SDK. Discovers providers and models once; call at startup. */
export async function createPiSdk(): Promise<PiSdk> {
  const modelRuntime = await ModelRuntime.create();

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
  };
}
