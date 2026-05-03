import {existsSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {serve} from "@hono/node-server";
import type {ServerType} from "@hono/node-server";
import {serveStatic} from "@hono/node-server/serve-static";
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

export function startServer(options: StartServerOptions): Promise<RunningServer> {
  const staticRoot = resolveClientDir();
  const app = new Hono();

  app.get("/health", (context) => context.json({ok: true}));

  if (options.devUrl) {
    app.get("*", (context) => {
      const requestUrl = new URL(context.req.url);
      return context.redirect(new URL(requestUrl.pathname + requestUrl.search, options.devUrl).toString());
    });
  } else {
    if (!staticRoot) {
      return Promise.reject(new Error("No web client found. Run the server build first."));
    }

    const resolvedStaticRoot = resolve(staticRoot);
    app.use("*", serveStatic({root: resolvedStaticRoot}));
    app.get("*", serveStatic({path: join(resolvedStaticRoot, "index.html")}));
  }

  const server = serve({
    fetch: app.fetch,
    hostname: options.host,
    port: options.port,
  });

  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Server failed to bind to a local port"));
        return;
      }

      resolveServer({
        url: `http://${options.host}:${address.port}`,
        close: () => closeServer(server),
      });
    });
  });
}

function closeServer(server: ServerType): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolveClose();
    });
  });
}
