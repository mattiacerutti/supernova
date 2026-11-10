import type {Server as HttpServer} from "node:http";
import type {Host, WebSocketLike} from "@earendil-works/chord";
import {webSocketLink} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import type {WebSocket} from "ws";
import {WebSocketServer} from "ws";

/** Bytes a connection may queue before it is closed as too slow; generous, a long transcript's snapshot fits. */
const MAX_BUFFERED_BYTES = 64 * 1024 * 1024;

/** A client that stops reading is dropped rather than buffered without bound; it reconnects and starts over. */
function boundedSocket(socket: WebSocket): WebSocketLike {
  return {
    get readyState() {
      return socket.readyState;
    },
    get binaryType() {
      return socket.binaryType;
    },
    set binaryType(type) {
      socket.binaryType = type as WebSocket["binaryType"];
    },
    send(data) {
      if (socket.bufferedAmount + data.length > MAX_BUFFERED_BYTES) socket.terminate();
      else socket.send(data);
    },
    close: () => socket.close(),
    addEventListener: socket.addEventListener.bind(socket) as WebSocketLike["addEventListener"],
    removeEventListener: socket.removeEventListener.bind(socket) as WebSocketLike["removeEventListener"],
  };
}

/** No authentication: every client is the owner, so the server must only be reachable by its owner. */
export function acceptRuntimeSockets(server: HttpServer, path: string, host: Host<RuntimePrincipal>): () => Promise<void> {
  const sockets = new WebSocketServer({server, path});
  sockets.on("connection", (socket: WebSocket) => host.accept(webSocketLink(boundedSocket(socket)), {principal: {kind: "owner"}}, BACKGROUND_CONTEXT));
  return async () => {
    for (const client of sockets.clients) client.terminate();
    await new Promise<void>((resolve) => sockets.close(() => resolve()));
  };
}
