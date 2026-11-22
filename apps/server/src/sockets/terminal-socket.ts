import type {IncomingMessage} from "node:http";
import type {Duplex} from "node:stream";
import type {TerminalSocket, TerminalSockets} from "@supernova/agent-runtime";
import type {WebSocket} from "ws";
import {WebSocketServer} from "ws";
import {refuse} from "@/socket";

const MAX_TERMINAL_MESSAGE_BYTES = 1024 * 1024;
/** An idle terminal sends nothing; without pings, proxies close idle connections. */
const TERMINAL_PING_MS = 15_000;

function terminalSocket(socket: WebSocket): TerminalSocket {
  let answered = true;
  socket.on("pong", () => (answered = true));
  // A ping unanswered by the next one means the connection is gone, though it looks open.
  const ping = setInterval(() => {
    if (!answered) return socket.terminate();
    answered = false;
    socket.ping();
  }, TERMINAL_PING_MS).unref();
  socket.on("close", () => clearInterval(ping));
  socket.on("error", () => socket.terminate());
  return {
    get bufferedAmount() {
      return socket.bufferedAmount;
    },
    send: (data) => socket.send(data),
    close: (code) => socket.close(code),
    onMessage: (listener) =>
      socket.on("message", (data, binary) => {
        const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
        listener(binary ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes.toString("utf8"));
      }),
    onClose: (listener) => socket.on("close", listener),
  };
}

/** Admitted only with the one-use token the terminal's held `TerminalService` gave over the runtime socket. */
export function terminalSockets(terminals: TerminalSockets): {
  readonly server: WebSocketServer;
  readonly upgrade: (request: IncomingMessage, socket: Duplex, head: Buffer, url: URL) => void;
} {
  const server = new WebSocketServer({noServer: true, maxPayload: MAX_TERMINAL_MESSAGE_BYTES});

  const upgrade = async (request: IncomingMessage, socket: Duplex, head: Buffer, token: string): Promise<void> => {
    // Before the upgrade, so a refusal is an HTTP status, not a closed socket.
    const admission = await terminals.admit(token);
    if (admission.kind === "refused") return refuse(socket, admission.status);
    server.handleUpgrade(request, socket, head, (ws) => void terminals.connect(token, terminalSocket(ws)));
  };

  return {
    server,
    upgrade: (request, socket, head, url) => void upgrade(request, socket, head, url.searchParams.get("token") ?? "").catch(() => refuse(socket, 404)),
  };
}
