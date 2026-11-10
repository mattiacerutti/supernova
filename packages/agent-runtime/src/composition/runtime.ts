import type {Host} from "@earendil-works/chord";
import {createHost} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ServerHost} from "@supernova/contracts/lib/protocol";
import {Configuration} from "@supernova/agent-runtime/features/configuration/configuration";
import {Extensions} from "@supernova/agent-runtime/features/extensions/extensions";
import {Folders} from "@supernova/agent-runtime/features/folders/folders";
import {LoginSessions} from "@supernova/agent-runtime/features/providers/login/login-sessions";
import {Providers} from "@supernova/agent-runtime/features/providers/providers";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {FileCheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {SupernovaTools} from "@supernova/agent-runtime/features/session-runtime/tools/web-fetch";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/title-generator";
import {createTitleGenerator} from "@supernova/agent-runtime/features/session-runtime/title-generator";
import {Sessions} from "@supernova/agent-runtime/features/sessions/sessions";
import {SessionStatus} from "@supernova/agent-runtime/features/sessions/status/session-status";
import {spawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {Terminals} from "@supernova/agent-runtime/features/workspace/terminals/terminals";
import {Workspace} from "@supernova/agent-runtime/features/workspace/workspace";
import {Worktrees} from "@supernova/agent-runtime/features/worktrees/worktrees";
import type {SettingsManager} from "@earendil-works/pi-coding-agent";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";
import {SessionStore} from "@supernova/agent-runtime/pi/session-store";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import {createResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import {createPiSdk} from "@supernova/agent-runtime/pi/sdk";
import {SessionHosts} from "@supernova/agent-runtime/composition/session-hosts";

export interface AgentRuntime {
  readonly checkpointStore: CheckpointStore;
  readonly configuration: Configuration;
  readonly extensions: Extensions;
  readonly host: Host<RuntimePrincipal>;
  readonly sessionHosts: SessionHosts;
  readonly folders: Folders;
  readonly loginSessions: LoginSessions;
  readonly providers: Providers;
  readonly resourceCache: ResourceCache;
  readonly sdk: PiSdk;
  readonly sessions: Sessions;
  readonly status: SessionStatus;
  readonly store: SessionStore;
  readonly terminals: Terminals;
  readonly titleGenerator: TitleGenerator;
  readonly workspace: Workspace;
  readonly worktrees: Worktrees;
  readonly dispose: () => Promise<void>;
}

export interface CreateAgentRuntimeOptions {
  readonly sdk?: PiSdk;
  readonly sessionStorageRoot?: string;
  readonly checkpointStorageRoot?: string;
  readonly worktreeStorageRoot?: string;
  readonly checkpointStore?: CheckpointStore;
  readonly resourceCache?: ResourceCache;
  readonly titleGenerator?: TitleGenerator;
  readonly settings?: (cwd: string) => SettingsManager;
}

export async function createAgentRuntime(options: CreateAgentRuntimeOptions = {}): Promise<AgentRuntime> {
  const sdk = options.sdk ?? (await createPiSdk());
  const resourceCache = options.resourceCache ?? createResourceCache(sdk);
  const checkpointStore = options.checkpointStore ?? new FileCheckpointStore(options.checkpointStorageRoot);

  const store = await SessionStore.open(options.sessionStorageRoot);
  const status = new SessionStatus();
  const terminals = new Terminals({spawnPty});
  const loginSessions = new LoginSessions();

  const titleGenerator = options.titleGenerator ?? createTitleGenerator(sdk);

  const host = createHost<RuntimePrincipal>({
    address: ServerHost(),
    principal: {kind: "server"},
    onError: (error) => console.error("[runtime]", error),
  });

  const sessionHosts = new SessionHosts({
    sessionsRoot: store.root,
    checkpointStore,
    resourceCache,
    sdk,
    titleGenerator,
    extensions: [SupernovaTools],
    settings: (cwd) => options.settings?.(cwd) ?? loadPiSettings(cwd),
    find: (sessionId) => store.find(sessionId),
    onHostClosed: (sessionId) => status.change(sessionId, {kind: "unavailable"}),
  });

  return {
    host,
    sessionHosts,
    checkpointStore,
    configuration: new Configuration(),
    extensions: new Extensions({resourceCache, sdk}),
    folders: new Folders(),
    loginSessions,
    providers: new Providers({loginSessions, sdk}),
    resourceCache,
    sdk,
    sessions: new Sessions({resourceCache, sdk, store}),
    status,
    store,
    terminals,
    titleGenerator,
    workspace: new Workspace({terminals}),
    worktrees: new Worktrees(options.worktreeStorageRoot),
    dispose: async () => {
      await sessionHosts.dispose();
      await host.close(BACKGROUND_CONTEXT);
      await terminals.dispose();
      store.close();
    },
  };
}
