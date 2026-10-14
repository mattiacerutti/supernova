import type {Host, Link} from "@earendil-works/chord";
import {createHost, memoryLinkPair} from "@earendil-works/chord";
import {RUNTIME_HOST} from "@supernova/contracts/lib/protocol";
import {serveRuntime} from "@supernova/agent-runtime/runtime-services";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";

/** A client host connected to the runtime, and every frame the server sent it (JSON text, as on the wire). */
export interface RuntimeTestClient {
  readonly host: Host;
  readonly received: readonly string[];
}

/** The server's end of a client link, recording what it sends. */
function recording(link: Link, received: string[]): Link {
  return {
    get closed() {
      return link.closed;
    },
    send: (frame) => {
      received.push(JSON.stringify(frame));
      link.send(frame);
    },
    receive: (handler) => link.receive(handler),
    onClose: (handler) => link.onClose(handler),
    close: (reason) => link.close(reason),
  };
}

/**
 * The runtime's services on a real Chord host, and client hosts connected to it over in-memory links: frames are
 * JSON round-tripped and delivered asynchronously, as over the server's WebSocket. Every client acts as the owner.
 */
export function startRuntimeServer(runtime: AgentRuntime): {
  readonly client: Host;
  readonly connectClient: () => RuntimeTestClient;
  readonly close: () => Promise<void>;
} {
  const server = createHost({name: RUNTIME_HOST});
  serveRuntime(server, runtime);
  const clients: Host[] = [];
  const connectClient = (): RuntimeTestClient => {
    const received: string[] = [];
    const [down, up] = memoryLinkPair();
    server.accept(recording(down, received), {principal: {kind: "owner"}, kind: "client"});
    const host = createHost({name: "browser", kind: "client", upstream: up});
    clients.push(host);
    return {host, received};
  };
  return {
    client: connectClient().host,
    connectClient,
    close: async () => {
      for (const client of clients) await client.close();
      await server.close();
    },
  };
}
