import {createServer} from "node:http";
import type {Socket} from "node:net";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import {Server as SessionServiceServer} from "@earendil-works/pi-server";
import {AgentRpcGroup} from "@supernova/contracts";
import {SESSION_SERVER_ID, SESSION_SERVICES_PATH} from "@supernova/contracts/sessions/services";
import type {AgentRuntime} from "@supernova/agent-runtime";
import {agentRpcLayer, createAgentRuntime, sessionServiceHost} from "@supernova/agent-runtime";
import {Context, Effect, Exit, Layer, Scope} from "effect";
import {HttpRouter, HttpServer, HttpServerResponse} from "effect/unstable/http";
import {RpcSerialization, RpcServer} from "effect/unstable/rpc";
import {createWebSocketListener} from "@/session-socket";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4317;

/**
 * The runtime is created once per server and disposed with the server's scope. `onRuntime` receives it once it is
 * built, so the session service protocol can be served beside the RPC routes.
 */
const routes = (onRuntime: (runtime: AgentRuntime) => Promise<void>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const runtime = yield* Effect.acquireRelease(
        Effect.promise(() => createAgentRuntime()),
        (created) => Effect.promise(() => created.dispose())
      );
      yield* Effect.promise(() => onRuntime(runtime));
      const rpc = RpcServer.layerHttp({
        group: AgentRpcGroup,
        path: "/ws",
        protocol: "websocket",
        spanAttributes: {"rpc.system": "effect-rpc", "rpc.transport": "websocket"},
        spanPrefix: "pi.ws.rpc",
      }).pipe(Layer.provide(agentRpcLayer(runtime)), Layer.provide(RpcSerialization.layerJson));

      return Layer.mergeAll(
        rpc,
        HttpRouter.add("GET", "/health", Effect.succeed(HttpServerResponse.jsonUnsafe({ok: true}))),
        HttpRouter.add("*", "*", Effect.succeed(HttpServerResponse.jsonUnsafe({error: "Not found"}, {status: 404})))
      );
    })
  );

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

/** Starts the API only. Readiness includes RPC initialization; one scope owns HTTP, WebSockets, and runtime resources. */
export async function startServer({host, port}: StartServerOptions): Promise<RunningServer> {
  parsePort(String(port));
  if (!host.trim()) throw new Error("A server host is required.");

  let closing: Promise<void> | undefined;
  const listener = createServer();
  const sockets = new Set<Socket>();

  listener.on("connection", (socket) => {
    if (closing) {
      socket.destroy();
      return;
    }

    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  // Session lifecycle and execution are Chord services on their own WebSocket; started once the runtime exists and
  // closed before it is disposed.
  let sessionServices: SessionServiceServer | undefined;
  const startSessionServices = async (runtime: AgentRuntime): Promise<void> => {
    sessionServices = new SessionServiceServer(sessionServiceHost(runtime), {
      serverId: SESSION_SERVER_ID,
      listeners: [createWebSocketListener(listener, SESSION_SERVICES_PATH)],
      onError: (error) => console.error("[session-services]", error),
    });
    await sessionServices.start();
  };

  const transport = NodeHttpServer.layer(() => listener, {host, port, disablePreemptiveShutdown: true});
  const server = HttpRouter.serve(routes(startSessionServices), {disableLogger: true, disableListenLog: true}).pipe(Layer.provideMerge(transport));
  const scope = Effect.runSync(Scope.make());

  const close = (): Promise<void> => {
    for (const socket of sockets) socket.destroy();

    closing ??= (async () => {
      await sessionServices?.close().catch(() => undefined);
      await Effect.runPromise(Scope.close(scope, Exit.void));
    })();
    return closing;
  };

  try {
    const context = await Effect.runPromise(
      Layer.buildWithScope(server, scope).pipe(
        Effect.mapError((error) => error.cause),
        Effect.timeout("10 seconds")
      )
    );

    const address = Context.get(context, HttpServer.HttpServer).address;
    if (address._tag !== "TcpAddress") throw new Error("Server did not bind a TCP port.");

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
