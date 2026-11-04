import type {Host, Link} from "@earendil-works/chord";
import {createHost, memoryLinkPair} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import type {AgentRuntime} from "@supernova/agent-runtime/composition/runtime";
import type {ServerHostHandle} from "@supernova/agent-runtime/composition/server-host";
import {startServerHost} from "@supernova/agent-runtime/composition/server-host";

/** A client host connected to the runtime, and every frame the server sent it (bytes, as on the wire). */
export interface TestClient {
  readonly host: Host<RuntimePrincipal>;
  readonly received: readonly Uint8Array[];
  /** Closes this client's link, as a closed tab does. */
  readonly disconnect: () => void;
}

/** The server's end of a client link, recording what it sends. */
function recording(link: Link, received: Uint8Array[]): Link {
  return {
    send: (message) => {
      received.push(message);
      link.send(message);
    },
    onMessage: (listener) => link.onMessage(listener),
    onClose: (listener) => link.onClose(listener),
    close: () => link.close(),
  };
}

/**
 * The runtime's Chord host, as the server composes it, and client hosts connected to it over in-memory links, each
 * acting as the owner as over the server's WebSocket.
 */
export async function startTestServerHost(runtime: AgentRuntime): Promise<{
  readonly serverHost: ServerHostHandle;
  readonly client: Host<RuntimePrincipal>;
  readonly connectClient: () => Promise<TestClient>;
  readonly close: () => Promise<void>;
}> {
  const serverHost = await startServerHost(runtime);
  const clients: Host<RuntimePrincipal>[] = [];
  const connectClient = async (): Promise<TestClient> => {
    const received: Uint8Array[] = [];
    const [down, up] = memoryLinkPair();
    serverHost.host.accept(recording(down, received), {principal: {kind: "owner"}}, BACKGROUND_CONTEXT);
    const host = createHost<RuntimePrincipal>({onError: () => undefined});
    host.connect(up, {principal: {kind: "server"}}, BACKGROUND_CONTEXT);
    await host.load([], BACKGROUND_CONTEXT);
    clients.push(host);
    return {host, received, disconnect: () => down.close()};
  };
  return {
    serverHost,
    client: (await connectClient()).host,
    connectClient,
    close: async () => {
      for (const client of clients) await client.close(BACKGROUND_CONTEXT);
      await serverHost.close();
    },
  };
}
