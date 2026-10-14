import type {Host} from "@earendil-works/chord";
import {createHost, memoryLinkPair} from "@earendil-works/chord";
import {RUNTIME_HOST} from "@supernova/contracts/lib/protocol";
import {serveRuntime} from "@supernova/agent-runtime/runtime-services";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";

/**
 * The runtime's services on a real Chord host, and a client host connected to it over an in-memory link: frames are
 * JSON round-tripped and delivered asynchronously, as over the server's WebSocket.
 */
export function startRuntimeServer(runtime: AgentRuntime): {readonly client: Host; readonly close: () => Promise<void>} {
  const server = createHost({name: RUNTIME_HOST});
  serveRuntime(server, runtime);
  const [down, up] = memoryLinkPair();
  server.accept(down, {principal: {kind: "owner"}, kind: "client"});
  const client = createHost({name: "browser", kind: "client", upstream: up});
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
