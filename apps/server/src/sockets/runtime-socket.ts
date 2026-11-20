import type {IncomingMessage} from "node:http";
import type {Duplex} from "node:stream";
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
export function runtimeSockets(host: Host<RuntimePrincipal>): {
  readonly server: WebSocketServer;
  readonly upgrade: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
} {
  const server = new WebSocketServer({noServer: true});
  return {
    server,
    upgrade: (request, socket, head) =>
      server.handleUpgrade(request, socket, head, (ws) => host.accept(webSocketLink(boundedSocket(ws)), {principal: {kind: "owner"}}, BACKGROUND_CONTEXT)),
  };
}
