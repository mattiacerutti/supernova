import type {ServerListener} from "@earendil-works/pi-server";
import {Server} from "@earendil-works/pi-server";
import type {ByteTransportFactory} from "@earendil-works/pi-client";
import {RUNTIME_SERVER_ID} from "@supernova/contracts/lib/protocol";
import {runtimeServiceHost} from "@supernova/agent-runtime/rpc/runtime-services";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";

type Accept = Parameters<ServerListener["start"]>[0];

/**
 * The runtime protocol over in-memory byte pairs instead of sockets: a real `pi-server` over the runtime's
 * services, and a transport factory for `pi-client` that connects to it. Bytes are delivered asynchronously, as a
 * socket would.
 */
export async function startRuntimeServer(runtime: AgentRuntime): Promise<{readonly transport: ByteTransportFactory; readonly close: () => Promise<void>}> {
  let accept: Accept | undefined;
  const listener: ServerListener = {
    start: async (acceptConnection) => {
      accept = acceptConnection;
    },
    close: async () => undefined,
  };
  const server = new Server(runtimeServiceHost(runtime), {serverId: RUNTIME_SERVER_ID, listeners: [listener]});
  await server.start();

  const transport: ByteTransportFactory = (client) => {
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      queueMicrotask(() => {
        server_.onClose();
        client.onClose();
      });
    };
    const server_ = accept!({
      get closed() {
        return closed;
      },
      send: async (chunk) => {
        if (closed) throw new Error("Connection closed.");
        const copy = chunk.slice();
        queueMicrotask(() => client.onData(copy));
      },
      close: (finalChunk) => {
        if (finalChunk && !closed) client.onData(finalChunk.slice());
        close();
      },
    });
    return {
      send: async (chunk) => {
        if (closed) throw new Error("Connection closed.");
        const copy = chunk.slice();
        queueMicrotask(() => server_.onData(copy));
      },
      close,
    };
  };

  return {transport, close: () => server.close()};
}
