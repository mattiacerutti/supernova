import type {IncomingMessage, Server as HttpServer} from "node:http";
import type {Duplex} from "node:stream";
import type {ServerListener} from "@earendil-works/pi-server";
import type {RawData, WebSocket} from "ws";
import {WebSocketServer} from "ws";

type ByteConnectionAcceptor = Parameters<ServerListener["start"]>[0];
type ByteConnection = Parameters<ByteConnectionAcceptor>[0];

/** Bytes a connection may queue before it is closed as too slow; generous, a long transcript's snapshot fits. */
const MAX_BUFFERED_BYTES = 64 * 1024 * 1024;

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** One WebSocket as a `pi-server` byte connection: binary messages in order, closed once. */
function byteConnection(socket: WebSocket): ByteConnection {
  return {
    get closed() {
      return socket.readyState === socket.CLOSING || socket.readyState === socket.CLOSED;
    },
    send(chunk) {
      if (socket.readyState !== socket.OPEN) return Promise.reject(new Error("The session socket is closed."));
      if (socket.bufferedAmount + chunk.byteLength > MAX_BUFFERED_BYTES) return Promise.reject(new Error("The session socket fell too far behind."));
      return new Promise<void>((resolve, reject) => socket.send(chunk, {binary: true}, (error) => (error ? reject(error) : resolve())));
    },
    close(finalChunk) {
      if (finalChunk && socket.readyState === socket.OPEN) socket.send(finalChunk, {binary: true});
      socket.close();
    },
  };
}

function pathOf(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://localhost").pathname;
}

/**
 * Accepts the runtime protocol as WebSockets on `path` of an HTTP server; other upgrades are refused. Each WebSocket
 * carries the protocol's framed bytes as binary messages.
 */
export function createWebSocketListener(server: HttpServer, path: string): ServerListener {
  const sockets = new WebSocketServer({noServer: true});
  let accept: ByteConnectionAcceptor | undefined;

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (pathOf(request) !== path || !accept) {
      socket.destroy();
      return;
    }
    const acceptConnection = accept;
    sockets.handleUpgrade(request, socket, head, (webSocket) => {
      const handler = acceptConnection(byteConnection(webSocket));
      webSocket.on("message", (data) => handler.onData(toBytes(data)));
      webSocket.on("error", (error) => handler.onError(error));
      webSocket.once("close", () => handler.onClose());
    });
  };

  return {
    async start(acceptConnection: ByteConnectionAcceptor) {
      accept = acceptConnection;
      server.on("upgrade", onUpgrade);
    },
    async close() {
      accept = undefined;
      server.off("upgrade", onUpgrade);
      for (const client of sockets.clients) client.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
    },
  };
}
