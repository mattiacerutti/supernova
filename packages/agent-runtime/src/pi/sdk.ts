import {createAgentSession, createAgentSessionServices, DefaultPackageManager, getAgentDir, ModelRuntime, SessionManager} from "@earendil-works/pi-coding-agent";
import type {ResourceLoader, SessionInfo} from "@earendil-works/pi-coding-agent";
import {createPiResourceLoaderOptions, CustomPiResourceLoader} from "@supernova/agent-runtime/pi/config/resource-loader";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";

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
  /** Updates the packages in the global Pi settings, as `pi update --extensions` does. Project packages are not touched. */
  readonly updatePackages: () => Promise<void>;
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
    updatePackages: async () => {
      // No project path: only global settings load, so project-scoped packages stay out of a server-wide update.
      const packageManager = new DefaultPackageManager({cwd: process.cwd(), agentDir: getAgentDir(), settingsManager: loadPiSettings()});
      await packageManager.update();
    },
  };
}
