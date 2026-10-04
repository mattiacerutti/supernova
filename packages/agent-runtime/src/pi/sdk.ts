import {EventEmitter} from "node:events";
import * as undici from "undici";
import {createAgentSessionServices, DefaultPackageManager, getAgentDir, ModelRuntime} from "@earendil-works/pi-coding-agent";
import type {ResourceLoader} from "@earendil-works/pi-coding-agent";
import {createPiResourceLoaderOptions} from "@supernova/agent-runtime/pi/config/resource-loader";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";

// Ported from Pi's packages/coding-agent/src/core/http-dispatcher.ts.
const DEFAULT_HTTP_IDLE_TIMEOUT_MS = 300_000;
// Node's 250ms default can terminate valid connection attempts on high-latency routes.
const DEFAULT_AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS = 2_000;

const originalGlobalFetch = globalThis.fetch;
let installedGlobalFetch: typeof globalThis.fetch | undefined;

const ignoreUndiciDispatcherError = (): void => {};

// Undici can emit an internal Client "error" while terminating a mid-stream fetch body. The body stream still rejects
// through reader.read(); this listener only prevents EventEmitter's unhandled "error" special case from crashing.
function withUndiciErrorListener<T extends undici.Dispatcher>(dispatcher: T): T {
  if (dispatcher instanceof EventEmitter) EventEmitter.prototype.on.call(dispatcher, "error", ignoreUndiciDispatcherError);
  return dispatcher;
}

function createUndiciClient(origin: string | URL, options: object): undici.Dispatcher {
  return withUndiciErrorListener(new undici.Client(origin, options as undici.Client.Options));
}

function createUndiciOriginDispatcher(origin: string | URL, options: object): undici.Dispatcher {
  const dispatcherOptions = options as undici.Pool.Options;
  if (dispatcherOptions.connections === 1) return createUndiciClient(origin, dispatcherOptions);
  return withUndiciErrorListener(new undici.Pool(origin, {...dispatcherOptions, factory: createUndiciClient}));
}

/** Exports `httpProxy` from settings as the proxy environment variables, unless they are already set. */
function applyHttpProxySettings(httpProxy: string | undefined): void {
  const proxy = httpProxy?.trim();
  if (!proxy) return;
  process.env.HTTP_PROXY ??= proxy;
  process.env.HTTPS_PROXY ??= proxy;
}

/**
 * Installs Pi's global undici dispatcher: proxy support, idle timeouts, and one undici for fetch. Without it some
 * provider streams end early. The old SDK did this implicitly; call once before any provider request.
 */
function configureHttpDispatcher(timeoutMs: number = DEFAULT_HTTP_IDLE_TIMEOUT_MS): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new Error(`Invalid HTTP idle timeout: ${String(timeoutMs)}`);
  const normalizedTimeoutMs = Math.floor(timeoutMs);
  const dispatcher = withUndiciErrorListener(
    new undici.EnvHttpProxyAgent({
      allowH2: false,
      // Keep HTTP origins on CONNECT tunnels as they were before Undici 8.7.
      proxyTunnel: true,
      bodyTimeout: normalizedTimeoutMs,
      connect: {autoSelectFamilyAttemptTimeout: DEFAULT_AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS},
      headersTimeout: normalizedTimeoutMs,
      clientFactory: createUndiciClient,
      factory: createUndiciOriginDispatcher,
    } as undici.EnvHttpProxyAgent.Options)
  );
  undici.setGlobalDispatcher(dispatcher);
  // Keep fetch and the dispatcher on the same undici implementation; a deliberate fetch override is preserved.
  const shouldInstallGlobals = installedGlobalFetch === undefined ? globalThis.fetch === originalGlobalFetch : globalThis.fetch === installedGlobalFetch;
  if (shouldInstallGlobals) {
    undici.install?.();
    installedGlobalFetch = globalThis.fetch;
  }
}

export type PiModel = ReturnType<ModelRuntime["getModels"]>[number];

/** The Pi surface the rest of the runtime uses. Tests substitute a faux `ModelRuntime` and in-memory loaders. */
export interface PiSdk {
  /**
   * Loads a project's resources (extensions, skills, prompt templates, context files) with Supernova's discovery
   * policy. Providers that extensions register are applied to `modelRuntime`.
   */
  readonly loadResourceLoader: (input: {readonly projectPath: string}) => Promise<ResourceLoader>;
  readonly modelRuntime: ModelRuntime;
  /** Updates the packages in the global Pi settings, as `pi update --extensions` does. Project packages are not touched. */
  readonly updatePackages: () => Promise<void>;
}

/** Connects to the real Pi SDK. Configures HTTP and discovers providers and models once; call at startup. */
export async function createPiSdk(): Promise<PiSdk> {
  const settings = loadPiSettings();
  applyHttpProxySettings(settings.getGlobalSettings().httpProxy);
  configureHttpDispatcher(settings.getHttpIdleTimeoutMs());
  const modelRuntime = await ModelRuntime.create();

  return {
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
    updatePackages: async () => {
      // No project path: only global settings load, so project-scoped packages stay out of a server-wide update.
      const packageManager = new DefaultPackageManager({cwd: process.cwd(), agentDir: getAgentDir(), settingsManager: loadPiSettings()});
      await packageManager.update();
    },
  };
}
