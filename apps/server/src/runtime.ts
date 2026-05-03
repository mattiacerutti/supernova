import {existsSync} from "node:fs";
import {readFile, stat} from "node:fs/promises";
import {createServer} from "node:http";
import {dirname, extname, join, normalize, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import {AGENT_RPC_METHODS, AgentRpcGroup} from "@pi-desktop/contracts";
import {AgentRuntimeServicesLive, ProjectsService} from "@pi-desktop/agent-runtime";
import {Effect, Exit, Fiber, Layer, Option, Scope} from "effect";
import {HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse} from "effect/unstable/http";
import {RpcSerialization, RpcServer} from "effect/unstable/rpc";

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

function contentTypeForPath(path: string): string {
  switch (extname(path)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function isWithinDirectory(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

function resolveStaticPath(staticRoot: string, pathname: string): string | undefined {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const rawRelativePath = requestPath.replace(/^[/\\]+/, "");
  const relativePath = normalize(rawRelativePath).replace(/^[/\\]+/, "");
  if (relativePath.length === 0 || rawRelativePath.startsWith("..") || relativePath.startsWith("..") || relativePath.includes("\0")) {
    return undefined;
  }

  const candidate = resolve(staticRoot, relativePath);
  return isWithinDirectory(staticRoot, candidate) ? candidate : undefined;
}

function resolveDevRedirectUrl(devUrl: string, requestUrl: URL): string {
  const redirectUrl = new URL(requestUrl.pathname + requestUrl.search, devUrl);
  redirectUrl.searchParams.set("agentDesktopServerUrl", requestUrl.origin);
  return redirectUrl.toString();
}

function staticRoute(options: StartServerOptions) {
  return HttpRouter.add(
    "GET",
    "*",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const requestUrl = HttpServerRequest.toURL(request);
      if (Option.isNone(requestUrl)) {
        return HttpServerResponse.text("Bad Request", {status: 400});
      }

      if (requestUrl.value.pathname === "/ws") {
        return HttpServerResponse.text("Not Found", {status: 404});
      }

      if (options.devUrl) {
        return HttpServerResponse.redirect(resolveDevRedirectUrl(options.devUrl, requestUrl.value), {status: 302});
      }

      const staticDir = resolveClientDir();
      if (!staticDir) {
        return HttpServerResponse.text("No web client found. Run the server build first.", {status: 503});
      }

      const staticRoot = resolve(staticDir);
      const requestedFilePath = resolveStaticPath(staticRoot, requestUrl.value.pathname);
      if (!requestedFilePath) {
        return HttpServerResponse.text("Invalid static file path", {status: 400});
      }

      const filePath = yield* Effect.tryPromise(async () => {
        const fileInfo = await stat(requestedFilePath).catch(() => undefined);
        if (fileInfo?.isFile()) return requestedFilePath;
        return join(staticRoot, "index.html");
      });

      const data = yield* Effect.tryPromise(() => readFile(filePath)).pipe(Effect.catch(() => Effect.succeed(undefined)));
      if (!data) {
        return HttpServerResponse.text("Not Found", {status: 404});
      }

      return HttpServerResponse.uint8Array(data, {
        contentType: contentTypeForPath(filePath),
        status: 200,
      });
    })
  );
}

const healthRoute = HttpRouter.add("GET", "/health", Effect.succeed(HttpServerResponse.jsonUnsafe({ok: true})));

const agentRpcLayer = AgentRpcGroup.toLayer(
  Effect.gen(function* () {
    const projects = yield* ProjectsService;

    return {
      [AGENT_RPC_METHODS.projectsList]: () => projects.list,
    };
  })
);

const wsRoute = HttpRouter.add(
  "GET",
  "/ws",
  Effect.gen(function* () {
    const rpcWebSocketHttpEffect = yield* RpcServer.toHttpEffectWebsocket(AgentRpcGroup, {
      spanAttributes: {
        "rpc.system": "effect-rpc",
        "rpc.transport": "websocket",
      },
      spanPrefix: "pi.ws.rpc",
    }).pipe(Effect.provide(agentRpcLayer.pipe(Layer.provideMerge(AgentRuntimeServicesLive), Layer.provideMerge(RpcSerialization.layerJson))));
    return yield* rpcWebSocketHttpEffect;
  })
);

function makeServerLayer(options: StartServerOptions, onListening: (url: string) => void) {
  const routes = Layer.mergeAll(healthRoute, wsRoute, staticRoute(options));
  const listeningLayer = Layer.effectDiscard(
    Effect.gen(function* () {
      const server = yield* HttpServer.HttpServer;
      const address = server.address;
      if (typeof address === "string" || !("port" in address)) {
        throw new Error("Server failed to bind to a local port");
      }
      onListening(`http://${options.host}:${address.port}`);
    })
  );

  return Layer.mergeAll(HttpRouter.serve(routes), listeningLayer).pipe(Layer.provide(NodeHttpServer.layer(createServer, {host: options.host, port: options.port})));
}

export function startServer(options: StartServerOptions): Promise<RunningServer> {
  return new Promise((resolveServer, reject) => {
    let settled = false;
    const scope = Effect.runSync(Scope.make());
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      void yieldClose(scope, fiber);
      reject(new Error("Timed out waiting for Pi Desktop server to start"));
    }, 10_000);
    const serverLayer = makeServerLayer(options, (url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveServer({
        url,
        close: async () => {
          await yieldClose(scope, fiber);
        },
      });
    });
    const fiber = Effect.runFork(Layer.launch(serverLayer).pipe(Scope.provide(scope)));
  });
}

async function yieldClose(scope: Scope.Closeable, fiber: ReturnType<typeof Effect.runFork>): Promise<void> {
  await Effect.runPromise(Scope.close(scope, Exit.void));
  await Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.ignore));
}
