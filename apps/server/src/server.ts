import {createServer} from "node:http";
import type {ServerResponse} from "node:http";
import type {AddressInfo, Socket} from "node:net";
import {Server as RuntimeServer} from "@earendil-works/pi-server";
import {RUNTIME_SERVER_ID, RUNTIME_SOCKET_PATH} from "@supernova/contracts/runtime/services";
import {createAgentRuntime, runtimeServiceHost} from "@supernova/agent-runtime";
import {createWebSocketListener} from "@/runtime-socket";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4317;

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {"content-type": "application/json"}).end(JSON.stringify(body));
}

/** Parses a TCP port; zero asks the OS to allocate an available port. */
export function parsePort(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) > 65_535) {
    throw new Error("Port must be an integer between 0 and 65535.");
  }

  return Number(value);
}

export interface RunningServer {
  readonly url: string;
  readonly close: () => Promise<void>;
}

export interface StartServerOptions {
  readonly host: string;
  readonly port: number;
}

/**
 * Starts the API only: `/health` over HTTP and the runtime's Chord services over the `/ws` WebSocket. Readiness
 * includes runtime initialization; closing stops the services, then disposes the runtime.
 */
export async function startServer({host, port}: StartServerOptions): Promise<RunningServer> {
  parsePort(String(port));
  if (!host.trim()) throw new Error("A server host is required.");

  let closing: Promise<void> | undefined;
  const listener = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") json(response, 200, {ok: true});
    else json(response, 404, {error: "Not found"});
  });
  const sockets = new Set<Socket>();

  listener.on("connection", (socket) => {
    if (closing) {
      socket.destroy();
      return;
    }

    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  let runtime: Awaited<ReturnType<typeof createAgentRuntime>> | undefined;
  let services: RuntimeServer | undefined;

  const close = (): Promise<void> => {
    for (const socket of sockets) socket.destroy();

    closing ??= (async () => {
      await services?.close().catch((error: unknown) => console.error("[runtime-services]", error));
      await new Promise<void>((resolve) => listener.close(() => resolve()));
      await runtime?.dispose();
    })();
    return closing;
  };

  try {
    await new Promise<void>((resolve, reject) => {
      listener.once("error", reject);
      listener.listen(port, host, () => {
        listener.off("error", reject);
        resolve();
      });
    });

    runtime = await createAgentRuntime();

    services = new RuntimeServer(runtimeServiceHost(runtime), {
      serverId: RUNTIME_SERVER_ID,
      listeners: [createWebSocketListener(listener, RUNTIME_SOCKET_PATH)],
      onError: (error) => console.error("[runtime-services]", error),
    });
    await services.start();

    const address = listener.address() as AddressInfo;
    const hostname = host.includes(":") ? `[${host}]` : host;
    return {url: `http://${hostname}:${address.port}`, close};
  } catch (error) {
    await close();

    if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
      throw new Error(`Port ${port} is already in use on ${host}. Choose another --port, or use --port 0 for an available port.`, {cause: error});
    }

    throw error;
  }
}
