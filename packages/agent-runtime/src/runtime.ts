import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import {Configuration} from "@supernova/agent-runtime/features/configuration/configuration";
import {Extensions} from "@supernova/agent-runtime/features/extensions/extensions";
import {Folders} from "@supernova/agent-runtime/features/folders/folders";
import {Projects} from "@supernova/agent-runtime/features/projects/projects";
import {LoginSessions} from "@supernova/agent-runtime/features/providers/login/login-sessions";
import {Providers} from "@supernova/agent-runtime/features/providers/providers";
import {FileCheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {SessionRuntime} from "@supernova/agent-runtime/features/session-runtime/session-runtime";
import {createSupernovaTools} from "@supernova/agent-runtime/features/session-runtime/tools/tools";
import {createTitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";
import {Sessions} from "@supernova/agent-runtime/features/sessions/sessions";
import {createSpawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {Terminals} from "@supernova/agent-runtime/features/workspace/terminals/terminals";
import {Workspace} from "@supernova/agent-runtime/features/workspace/workspace";
import {Worktrees} from "@supernova/agent-runtime/features/worktrees/worktrees";
import {EventBus} from "@supernova/agent-runtime/lib/event-bus";
import {SessionStore} from "@supernova/agent-runtime/pi/session-store";
import {createResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import {createPiSdk} from "@supernova/agent-runtime/pi/sdk";

/** Every feature, constructed once with its dependencies. */
export interface AgentRuntime {
  readonly configuration: Configuration;
  readonly extensions: Extensions;
  readonly folders: Folders;
  readonly projects: Projects;
  readonly providers: Providers;
  readonly sessionRuntime: SessionRuntime;
  readonly sessions: Sessions;
  readonly workspace: Workspace;
  readonly worktrees: Worktrees;
  readonly dispose: () => Promise<void>;
}

interface CreateAgentRuntimeOptions {
  /** Defaults to the real Pi SDK; tests pass an in-memory one. */
  readonly sdk?: PiSdk;
  /** Where durable session files and their index live; defaults to `<agentDir>/sessions-v2`. */
  readonly sessionStorageRoot?: string;
  /** Where checkpoint manifests and shadow repositories live. */
  readonly checkpointStorageRoot?: string;
  /** Where session worktrees are created. */
  readonly worktreeStorageRoot?: string;
}

/** Wires the Pi SDK, stateful components, and features. Call `dispose()` on shutdown. */
export async function createAgentRuntime(options: CreateAgentRuntimeOptions = {}): Promise<AgentRuntime> {
  const sdk = options.sdk ?? (await createPiSdk());
  const resourceCache = createResourceCache(sdk);
  const events = new EventBus<SessionStreamEvent>();
  const checkpointStore = new FileCheckpointStore(options.checkpointStorageRoot);
  const supernovaTools = createSupernovaTools(sdk.modelRuntime);
  const store = new SessionStore({
    sdk,
    resourceCache,
    tools: () => supernovaTools,
    root: options.sessionStorageRoot,
    // Reports do not fail the command that hit them; they reach the client as session errors.
    onReport: (sessionId, message) => sessionRuntime.reportError(sessionId, message),
  });
  const sessionRuntime: SessionRuntime = new SessionRuntime({checkpointStore, events, resourceCache, sdk, store, titleGenerator: createTitleGenerator(sdk)});

  const terminals = new Terminals({spawnPty: createSpawnPty()});

  return {
    configuration: new Configuration(),
    extensions: new Extensions({resourceCache, sdk}),
    folders: new Folders(),
    projects: new Projects({store}),
    providers: new Providers({loginSessions: new LoginSessions(), sdk}),
    sessionRuntime,
    sessions: new Sessions({documents: sessionRuntime, resourceCache, sdk, store}),
    workspace: new Workspace({terminals}),
    worktrees: new Worktrees(options.worktreeStorageRoot),
    dispose: async () => {
      await Promise.all([terminals.dispose(), sessionRuntime.dispose()]);
    },
  };
}
