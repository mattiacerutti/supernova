import type {IncomingMessage, Server as HttpServer} from "node:http";
import type {Duplex} from "node:stream";
import type {Host} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {RUNTIME_SOCKET_PATH, TERMINAL_SOCKET_PATH} from "@supernova/contracts/lib/protocol";
import type {TerminalSockets} from "@supernova/agent-runtime";
import {runtimeSockets} from "@/sockets/runtime-socket";
import {terminalSockets} from "@/sockets/terminal-socket";

export function refuse(socket: Duplex, status: 400 | 403 | 404): void {
  socket.end(`HTTP/1.1 ${status} ${status === 400 ? "Bad Request" : status === 403 ? "Forbidden" : "Not Found"}\r\nConnection: close\r\n\r\n`);
}

export function acceptSockets(server: HttpServer, host: Host<RuntimePrincipal>, terminals: TerminalSockets): () => Promise<void> {
  const runtime = runtimeSockets(host);
  const terminal = terminalSockets(terminals);

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    // `new URL` throws on targets the HTTP parser accepts (`//`), and a throw here would end the process.
    const url = URL.parse(request.url ?? "/", "http://localhost");
    if (!url) refuse(socket, 400);
    else if (url.pathname === RUNTIME_SOCKET_PATH) runtime.upgrade(request, socket, head);
    else if (url.pathname === TERMINAL_SOCKET_PATH) terminal.upgrade(request, socket, head, url);
    else refuse(socket, 400);
  };
  // Routed here: a `ws` server bound to the HTTP server would refuse every other path's upgrade.
  server.on("upgrade", onUpgrade);

  return async () => {
    server.off("upgrade", onUpgrade);
    for (const {server: sockets} of [runtime, terminal]) {
      for (const client of sockets.clients) client.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
    }
  };
}
