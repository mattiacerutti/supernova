import type {Host} from "@earendil-works/chord";
import {createHost} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ServerHost} from "@supernova/contracts/lib/protocol";
import {configurationFacet} from "@supernova/agent-runtime/features/configuration/facet";
import {extensionsFacet} from "@supernova/agent-runtime/features/extensions/facet";
import {foldersFacet} from "@supernova/agent-runtime/features/folders/facet";
import {providersFacet} from "@supernova/agent-runtime/features/providers/facet";
import {sessionsFacet} from "@supernova/agent-runtime/features/sessions/facet";
import {workspaceFacet} from "@supernova/agent-runtime/features/workspace/facet";
import type {AgentRuntime} from "@supernova/agent-runtime/composition/runtime";
import {SessionHosts} from "@supernova/agent-runtime/composition/session-hosts";
import {sessionWorkflows} from "@supernova/agent-runtime/composition/session-workflows";

export interface ServerHostHandle {
  readonly host: Host<RuntimePrincipal>;
  readonly hosts: SessionHosts;
  readonly close: () => Promise<void>;
}

/** Loads every feature's facet but `session-runtime`'s, which each session host loads. */
export async function startServerHost(runtime: AgentRuntime): Promise<ServerHostHandle> {
  const context = BACKGROUND_CONTEXT;
  const host = createHost<RuntimePrincipal>({address: ServerHost(), principal: {kind: "server"}, onError: (error) => console.error("[runtime]", error)});

  const hosts = new SessionHosts({
    checkpointStore: runtime.checkpointStore,
    resourceCache: runtime.resourceCache,
    sdk: runtime.sdk,
    store: runtime.store,
    titleGenerator: runtime.titleGenerator,
    // Archived sessions keep their record but have no running host.
    exists: async (sessionId) => (await runtime.store.find(sessionId))?.archivedAt === undefined && (await runtime.sessions.exists({sessionId})),
    stopped: (sessionId) => runtime.status.change(sessionId, {kind: "unavailable"}),
  });
  const isCurrent = (sessionId: string, generation: number) => hosts.current(sessionId, generation);
  const workflows = sessionWorkflows({runtime, server: host, hosts});

  hosts.routeOn(host, context);
  await host.load(
    [
      {name: "@supernova/configuration", facet: configurationFacet(runtime.configuration)},
      {name: "@supernova/extensions", facet: extensionsFacet(runtime.extensions, runtime.store)},
      {name: "@supernova/folders", facet: foldersFacet(runtime.folders)},
      {name: "@supernova/providers", facet: providersFacet(runtime.providers, runtime.loginSessions)},
      {name: "@supernova/sessions", facet: sessionsFacet({sessions: runtime.sessions, status: runtime.status, store: runtime.store, workflows, isCurrent})},
      {name: "@supernova/workspace", facet: workspaceFacet(runtime.workspace, runtime.terminals)},
    ],
    context
  );

  return {
    host,
    hosts,
    close: async () => {
      await hosts.dispose();
      await host.close(context);
    },
  };
}
