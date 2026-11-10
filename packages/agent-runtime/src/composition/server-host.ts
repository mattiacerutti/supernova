import type {Host} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {configurationFacet} from "@supernova/agent-runtime/features/configuration/facet";
import {extensionsFacet} from "@supernova/agent-runtime/features/extensions/facet";
import {foldersFacet} from "@supernova/agent-runtime/features/folders/facet";
import {providersFacet} from "@supernova/agent-runtime/features/providers/facet";
import {sessionsFacet} from "@supernova/agent-runtime/features/sessions/facet";
import {workspaceFacet} from "@supernova/agent-runtime/features/workspace/facet";
import type {AgentRuntime} from "@supernova/agent-runtime/composition/runtime";

export interface ServerHostHandle {
  readonly host: Host<RuntimePrincipal>;
  readonly close: () => Promise<void>;
}

export async function startServerHost(runtime: AgentRuntime): Promise<ServerHostHandle> {
  const {host, sessionHosts: hosts} = runtime;

  hosts.routeOn(host, BACKGROUND_CONTEXT);

  await host.load(
    [
      {name: "@supernova/configuration", facet: configurationFacet(runtime.configuration)},
      {name: "@supernova/extensions", facet: extensionsFacet(runtime.extensions, () => hosts.reload())},
      {name: "@supernova/folders", facet: foldersFacet(runtime.folders)},
      {name: "@supernova/providers", facet: providersFacet(runtime.providers, runtime.loginSessions)},
      {name: "@supernova/sessions", facet: sessionsFacet(runtime)},
      {name: "@supernova/workspace", facet: workspaceFacet(runtime.workspace, runtime.terminals)},
    ],
    BACKGROUND_CONTEXT
  );

  return {
    host,
    close: async () => {
      await hosts.dispose();
      await host.close(BACKGROUND_CONTEXT);
    },
  };
}
