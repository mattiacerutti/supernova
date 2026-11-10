import {homedir} from "node:os";
import {join, resolve} from "node:path";
import type {Host, PluginFacet} from "@earendil-works/chord";
import {createHost} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {SettingsManager} from "@earendil-works/pi-coding-agent";
import {getAgentDir} from "@earendil-works/pi-coding-agent";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ServerHost} from "@supernova/contracts/lib/protocol";
import type {RuntimeNatives, RuntimePaths} from "@supernova/agent-runtime/core/contract";
import {SessionHosts} from "@supernova/agent-runtime/composition/session-hosts";
import {SessionsNative, SessionStatusNative} from "@supernova/agent-runtime/features/sessions/contract";
import {serverCoreFacet, sessionCoreFacet} from "@supernova/agent-runtime/core/facet";
import {configurationFacet} from "@supernova/agent-runtime/features/configuration/facet";
import {extensionsFacet} from "@supernova/agent-runtime/features/extensions/facet";
import {foldersFacet} from "@supernova/agent-runtime/features/folders/facet";
import {providersFacet} from "@supernova/agent-runtime/features/providers/facet";
import type {CheckpointStore} from "@supernova/agent-runtime/features/chat/natives/checkpoint-store";
import {FileCheckpointStore} from "@supernova/agent-runtime/features/chat/natives/checkpoint-store";
import {chatFacet} from "@supernova/agent-runtime/features/chat/facet";
import {SupernovaTools} from "@supernova/agent-runtime/features/chat/tools/web-fetch";
import {sessionsFacet} from "@supernova/agent-runtime/features/sessions/facet";
import {workspaceFacet} from "@supernova/agent-runtime/features/workspace/facet";
import {worktreesFacet} from "@supernova/agent-runtime/features/worktrees/facet";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";
import type {SessionRecord} from "@supernova/agent-runtime/core/session-state";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import {createResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import {createPiSdk} from "@supernova/agent-runtime/pi/sdk";

/** The old SDK's, which also holds its project folders until they are imported. */
const SESSIONS_DIR = "sessions";

export interface ServerHostOptions {
  readonly sdk?: PiSdk;
  readonly sessionStorageRoot?: string;
  readonly checkpointStorageRoot?: string;
  readonly worktreeStorageRoot?: string;
  readonly checkpointStore?: CheckpointStore;
  readonly resourceCache?: ResourceCache;
  readonly settings?: (cwd: string) => SettingsManager;
}

export interface ServerHostHandle {
  readonly host: Host<RuntimePrincipal>;
  readonly close: () => Promise<void>;
}

const SERVER_FEATURES: readonly PluginFacet<RuntimePrincipal>[] = [
  {name: "@supernova/configuration", facet: configurationFacet},
  {name: "@supernova/extensions", facet: extensionsFacet},
  {name: "@supernova/folders", facet: foldersFacet},
  {name: "@supernova/providers", facet: providersFacet},
  {name: "@supernova/sessions", facet: sessionsFacet},
  {name: "@supernova/workspace", facet: workspaceFacet},
  {name: "@supernova/worktrees", facet: worktreesFacet},
];

export async function startServerHost(options: ServerHostOptions = {}): Promise<ServerHostHandle> {
  const sdk = options.sdk ?? (await createPiSdk());
  const paths: RuntimePaths = {
    sessionsRoot: options.sessionStorageRoot ?? join(getAgentDir(), SESSIONS_DIR),
    worktreesRoot: options.worktreeStorageRoot ?? join(agentDataRoot(), "worktrees"),
  };
  const natives: RuntimeNatives = {
    sdk,
    resourceCache: options.resourceCache ?? createResourceCache(sdk),
    checkpointStore: options.checkpointStore ?? new FileCheckpointStore(options.checkpointStorageRoot),
    extensions: [SupernovaTools],
    settings: (cwd) => options.settings?.(cwd) ?? loadPiSettings(cwd),
  };

  const host = createHost<RuntimePrincipal>({
    address: ServerHost(),
    principal: {kind: "server"},
    onError: (error) => console.error("[runtime]", error),
  });

  const hosts = new SessionHosts(
    {
      server: host,
      find: async (sessionId, context) => (await host.registry(SessionsNative, context)).value?.value.find(sessionId),
      facets: (record) => sessionFacets(paths, natives, record),
      onHostClosed: (sessionId) =>
        void host
          .registry(SessionStatusNative, BACKGROUND_CONTEXT)
          .then((status) => status.value?.value.change(sessionId, {kind: "unavailable"}))
          .catch(() => undefined),
    },
    BACKGROUND_CONTEXT
  );

  const report = await host.load([{name: "@supernova/core", facet: serverCoreFacet(paths, natives, hosts)}, ...SERVER_FEATURES], BACKGROUND_CONTEXT);
  if (report.failed.length > 0) {
    await host.close(BACKGROUND_CONTEXT);
    throw new AggregateError(
      report.failed.map((failure) => failure.error),
      `Failed to load ${report.failed.map((failure) => failure.plugin).join(", ")}.`
    );
  }

  return {
    host,
    close: async () => {
      await hosts.close();
      await host.close(BACKGROUND_CONTEXT);
    },
  };
}

function sessionFacets(paths: RuntimePaths, natives: RuntimeNatives, record: SessionRecord): readonly PluginFacet<RuntimePrincipal>[] {
  return [
    {name: "@supernova/core", facet: sessionCoreFacet(paths, natives, record)},
    {name: "@supernova/chat", facet: chatFacet},
  ];
}

function agentDataRoot(): string {
  return resolve(process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".supernova", "userdata", "agent"));
}
