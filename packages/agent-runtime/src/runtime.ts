import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import {Configuration} from "@supernova/agent-runtime/features/configuration/configuration";
import {Folders} from "@supernova/agent-runtime/features/folders/folders";
import {Projects} from "@supernova/agent-runtime/features/projects/projects";
import {LoginSessions} from "@supernova/agent-runtime/features/providers/login/login-sessions";
import {Providers} from "@supernova/agent-runtime/features/providers/providers";
import {FileCheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {SessionRuntime} from "@supernova/agent-runtime/features/session-runtime/session-runtime";
import {createAgentSessionFactory} from "@supernova/agent-runtime/features/session-runtime/worker/agent-session-factory";
import {SessionPool} from "@supernova/agent-runtime/features/session-runtime/worker/session-pool";
import {createTitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";
import {Sessions} from "@supernova/agent-runtime/features/sessions/sessions";
import {Workspace} from "@supernova/agent-runtime/features/workspace/workspace";
import {EventBus} from "@supernova/agent-runtime/lib/event-bus";
import {createResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import {createPiSdk} from "@supernova/agent-runtime/pi/sdk";

/** Every feature, constructed once with its dependencies. */
export interface AgentRuntime {
  readonly configuration: Configuration;
  readonly folders: Folders;
  readonly projects: Projects;
  readonly providers: Providers;
  readonly sessionRuntime: SessionRuntime;
  readonly sessions: Sessions;
  readonly workspace: Workspace;
  readonly dispose: () => Promise<void>;
}

interface CreateAgentRuntimeOptions {
  /** Defaults to the real Pi SDK; tests pass an in-memory one. */
  readonly sdk?: PiSdk;
  /** Where checkpoint manifests and shadow repositories live. */
  readonly checkpointStorageRoot?: string;
}

/** Wires the Pi SDK, stateful components, and features. Call `dispose()` on shutdown. */
export async function createAgentRuntime(options: CreateAgentRuntimeOptions = {}): Promise<AgentRuntime> {
  const sdk = options.sdk ?? (await createPiSdk());
  const resourceCache = createResourceCache(sdk);
  const events = new EventBus<SessionStreamEvent>();
  const pool = new SessionPool(
    {
      agentSessionFactory: createAgentSessionFactory(sdk),
      checkpointStore: new FileCheckpointStore(options.checkpointStorageRoot),
      eventBus: events,
      resourceCache,
      sdk,
    },
    createTitleGenerator(sdk)
  );

  return {
    configuration: new Configuration(),
    folders: new Folders(),
    projects: new Projects({sdk}),
    providers: new Providers({loginSessions: new LoginSessions(), sdk}),
    sessionRuntime: new SessionRuntime({events, pool}),
    sessions: new Sessions({resourceCache, sdk}),
    workspace: new Workspace(),
    dispose: () => pool.dispose(),
  };
}
