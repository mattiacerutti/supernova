import {Configuration} from "@supernova/agent-runtime/features/configuration/configuration";
import {Extensions} from "@supernova/agent-runtime/features/extensions/extensions";
import {Folders} from "@supernova/agent-runtime/features/folders/folders";
import {Projects} from "@supernova/agent-runtime/features/projects/projects";
import {LoginSessions} from "@supernova/agent-runtime/features/providers/login/login-sessions";
import {Providers} from "@supernova/agent-runtime/features/providers/providers";
import {FileCheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {SessionRuntime} from "@supernova/agent-runtime/features/session-runtime/session-runtime";
import {SupernovaTools} from "@supernova/agent-runtime/features/session-runtime/tools/web-fetch";
import {createTitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";
import {Sessions} from "@supernova/agent-runtime/features/sessions/sessions";
import {spawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {Terminals} from "@supernova/agent-runtime/features/workspace/terminals/terminals";
import {Workspace} from "@supernova/agent-runtime/features/workspace/workspace";
import {Worktrees} from "@supernova/agent-runtime/features/worktrees/worktrees";
import {SessionStore} from "@supernova/agent-runtime/pi/session-store";
import {createResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import {createPiSdk} from "@supernova/agent-runtime/pi/sdk";

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
  readonly sdk?: PiSdk;
  readonly sessionStorageRoot?: string;
  readonly checkpointStorageRoot?: string;
  readonly worktreeStorageRoot?: string;
}

export async function createAgentRuntime(options: CreateAgentRuntimeOptions = {}): Promise<AgentRuntime> {
  const sdk = options.sdk ?? (await createPiSdk());

  const resourceCache = createResourceCache(sdk);
  const checkpointStore = new FileCheckpointStore(options.checkpointStorageRoot);

  const store = new SessionStore({
    sdk,
    resourceCache,
    extensions: [SupernovaTools],
    root: options.sessionStorageRoot,
    // Reports do not fail the command that hit them; they reach clients through the session board.
    onReport: (sessionId, notice) => sessionRuntime.notify(sessionId, notice),
  });
  const sessionRuntime: SessionRuntime = new SessionRuntime({checkpointStore, resourceCache, sdk, store, titleGenerator: createTitleGenerator(sdk)});

  const terminals = new Terminals({spawnPty});

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
