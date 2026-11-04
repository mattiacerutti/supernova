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
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";
import {createTitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";
import {Sessions} from "@supernova/agent-runtime/features/sessions/sessions";
import {SessionStatus} from "@supernova/agent-runtime/features/sessions/status/session-status";
import {spawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {Terminals} from "@supernova/agent-runtime/features/workspace/terminals/terminals";
import {Workspace} from "@supernova/agent-runtime/features/workspace/workspace";
import {Worktrees} from "@supernova/agent-runtime/features/worktrees/worktrees";
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
  readonly settings?: ConstructorParameters<typeof SessionStore>[0]["settings"];
}

export async function createAgentRuntime(options: CreateAgentRuntimeOptions = {}): Promise<AgentRuntime> {
  const sdk = options.sdk ?? (await createPiSdk());
  const resourceCache = options.resourceCache ?? createResourceCache(sdk);
  const checkpointStore = options.checkpointStore ?? new FileCheckpointStore(options.checkpointStorageRoot);

  const store = new SessionStore({
    sdk,
    resourceCache,
    extensions: [SupernovaTools],
    root: options.sessionStorageRoot,
    ...(options.settings ? {settings: options.settings} : {}),
    // Reports do not fail the command that hit them; they reach clients as session notices.
    onReport: (sessionId, notice) => status.change(sessionId, {kind: "notice", notice: {level: "warning", ...notice}}),
  });
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
    checkpointStore,
    resourceCache,
    sdk,
    store,
    titleGenerator,
    // Archived sessions keep their record but have no running host.
    exists: async (sessionId) => {
      const record = await store.find(sessionId);
      return record !== undefined && record.archivedAt === undefined;
    },
    stopped: (sessionId) => status.change(sessionId, {kind: "unavailable"}),
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
      await Promise.all([terminals.dispose(), store.dispose()]);
    },
  };
}
