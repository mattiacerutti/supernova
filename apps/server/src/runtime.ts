import {existsSync} from "node:fs";
import type {Server as HttpServerType} from "node:http";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import * as NodeSocketServer from "@effect/platform-node/NodeSocketServer";
import {createAdaptorServer} from "@hono/node-server";
import type {ServerType} from "@hono/node-server";
import {serveStatic} from "@hono/node-server/serve-static";
import {AgentRpcGroup} from "@pi-desktop/contracts";
import {AgentRpcLive, AgentRuntimeServicesLive} from "@pi-desktop/agent-runtime";
import {Effect, Exit, Fiber, Layer, Scope} from "effect";
import {RpcSerialization, RpcServer} from "effect/unstable/rpc";
import {Hono} from "hono";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4317;
export const DEFAULT_WEB_DEV_URL = "http://localhost:5173";

const sourceDir = dirname(fileURLToPath(import.meta.url));

export interface RunningServer {
  url: string;
  close: () => Promise<void>;
}

export interface StartServerOptions {
  host: string;
  port: number;
  devUrl?: string;
}

function resolveClientDir(): string | undefined {
  const candidate = resolve(sourceDir, "client");
  return existsSync(join(candidate, "index.html")) ? candidate : undefined;
}

function resolveDevRedirectUrl(devUrl: string, requestUrl: URL): string {
  const redirectUrl = new URL(requestUrl.pathname + requestUrl.search, devUrl);
  redirectUrl.searchParams.set("agentDesktopServerUrl", requestUrl.origin);
  return redirectUrl.toString();
}

function createApp(options: StartServerOptions): Hono {
  const app = new Hono();

  app.get("/health", (context) => context.json({ok: true}));

  const devUrl = options.devUrl;
  if (devUrl) {
    app.get("*", (context) => context.redirect(resolveDevRedirectUrl(devUrl, new URL(context.req.url))));
    return app;
  }

  const staticRoot = resolveClientDir();
  if (!staticRoot) {
    throw new Error("No web client found. Run the server build first.");
  }

  const resolvedStaticRoot = resolve(staticRoot);
  app.use("*", serveStatic({root: resolvedStaticRoot}));
  app.get("*", serveStatic({path: join(resolvedStaticRoot, "index.html")}));

  return app;
}

function createRpcServerLayer(server: HttpServerType) {
  return RpcServer.layer(AgentRpcGroup, {
    spanAttributes: {
      "rpc.system": "effect-rpc",
      "rpc.transport": "websocket",
    },
    spanPrefix: "pi.ws.rpc",
  }).pipe(
    Layer.provide(AgentRpcLive.pipe(Layer.provideMerge(AgentRuntimeServicesLive))),
    Layer.provide(RpcServer.layerProtocolSocketServer),
    Layer.provide(RpcSerialization.layerJson),
    Layer.provide(NodeSocketServer.layerWebSocket({path: "/ws", server}))
  );
}

export function startServer(options: StartServerOptions): Promise<RunningServer> {
  const app = createApp(options);
  const server = createAdaptorServer({fetch: app.fetch}) as HttpServerType;
  const scope = Effect.runSync(Scope.make());
  const fiber = Effect.runFork(Layer.launch(createRpcServerLayer(server)).pipe(Scope.provide(scope)));

  return new Promise((resolveServer, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      void closeServer(server, scope, fiber);
      reject(new Error("Timed out waiting for Pi Desktop server to start"));
    }, 10_000);

    server.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void closeServer(server, scope, fiber);
      reject(error);
    });

    server.once("listening", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        void closeServer(server, scope, fiber);
        reject(new Error("Server failed to bind to a local port"));
        return;
      }

      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveServer({
        url: `http://${options.host}:${address.port}`,
        close: () => closeServer(server, scope, fiber),
      });
    });

    server.listen(options.port, options.host);
  });
}

async function closeServer(server: ServerType, scope: Scope.Closeable, fiber: ReturnType<typeof Effect.runFork>): Promise<void> {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolveClose();
    });
  });
  await Effect.runPromise(Scope.close(scope, Exit.void));
  await Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.ignore));
}
