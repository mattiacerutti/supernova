import type {IncomingMessage, Server as HttpServer} from "node:http";
import type {Host, WebSocketLike} from "@earendil-works/chord";
import {acceptWebSockets} from "@earendil-works/chord";
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
    send(data) {
      if (socket.bufferedAmount + data.length > MAX_BUFFERED_BYTES) socket.terminate();
      else socket.send(data);
    },
    close: (code, reason) => socket.close(code, reason),
    addEventListener: socket.addEventListener.bind(socket) as WebSocketLike["addEventListener"],
  };
}

/**
 * Accepts Chord client links as WebSockets on `path` of an HTTP server; other upgrades are refused. There is no
 * authentication: every client acts as the same principal, so the server must only be reachable by its owner.
 * Returns the close.
 */
export function acceptRuntimeSockets(server: HttpServer, path: string, host: Host): () => Promise<void> {
  const sockets = new WebSocketServer({server, path});
  const connections = {
    on: (_event: "connection", listener: (socket: WebSocketLike, request: IncomingMessage) => void) =>
      sockets.on("connection", (socket: WebSocket, request: IncomingMessage) => listener(boundedSocket(socket), request)),
  };
  acceptWebSockets(connections, host, {principal: () => ({kind: "owner"})});
  return async () => {
    for (const client of sockets.clients) client.terminate();
    await new Promise<void>((resolve) => sockets.close(() => resolve()));
  };
}
