import {spawn} from "node:child_process";
import type {ChildProcess} from "node:child_process";
import {resolve, sep} from "node:path";
import {createServer} from "vite";
import type {ViteDevServer} from "vite";
import {startServerProcess} from "@supernova/server/process";
import type {ServerProcess} from "@supernova/server/process";

const apiSources = ["apps/server/src", "packages/agent-runtime/src", "packages/contracts/src"].map((path) => resolve(path));

let api: ServerProcess | undefined;
let web: ViteDevServer | undefined;
let desktop: ChildProcess | undefined;
let stopping = false;
let restarting: Promise<void> = Promise.resolve();
let reloadTimer: ReturnType<typeof setTimeout> | undefined;

/** Stops the whole dev process tree, including Electron launched by electron-vite. */
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  clearTimeout(reloadTimer);

  if (desktop?.pid && desktop.exitCode === null && desktop.signalCode === null) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(desktop.pid), "/t", "/f"], {stdio: "ignore"});
    } else {
      const group = -desktop.pid;

      const killGroup = (signal: NodeJS.Signals): void => {
        try {
          process.kill(group, signal);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") console.error(error);
        }
      };

      killGroup("SIGTERM");
      // The command wrapper can exit before Electron; keep escalation alive for the entire group.
      setTimeout(() => killGroup("SIGKILL"), 5_000);
    }
  }

  try {
    await web?.close();
  } finally {
    await restarting;
    await api?.close();
  }
}

async function startApi(port = 0): Promise<ServerProcess> {
  const child = await startServerProcess({
    entry: resolve("apps/server/src/cli.ts"),
    execPath: process.execPath,
    env: {SUPERNOVA_SERVER_DEV: "1"},
    port,
  });
  api = child;

  void child.exited.then(() => {
    if (!stopping && api === child) {
      process.exitCode = 1;
      void stop();
    }
  });

  return child;
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

try {
  const endpoint = (await startApi()).url;
  process.env.SUPERNOVA_SERVER_URL = endpoint;

  web = await createServer({
    root: resolve("packages/web"),
    configFile: resolve("packages/web/vite.config.ts"),
  });
  await web.listen();
  web.printUrls();

  web.watcher.add(apiSources);
  web.watcher.on("all", (_event, path) => {
    if (stopping || !apiSources.some((source) => path.startsWith(source + sep))) return;

    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      restarting = restarting
        .then(async () => {
          if (stopping) return;

          const previous = api;
          api = undefined;
          await previous?.close();

          // Keep the endpoint stable across edits so browser and desktop transports reconnect.
          if (!stopping) await startApi(Number(new URL(endpoint).port));
        })
        .catch((error) => {
          console.error(error);
          process.exitCode = 1;
          void stop();
        });
    }, 100);
  });

  if (process.argv.includes("--desktop") && !stopping) {
    desktop = spawn("bun", ["run", "--filter", "@supernova/desktop", "dev"], {
      stdio: "inherit",
      detached: process.platform !== "win32",
      env: {...process.env, ELECTRON_RUN_AS_NODE: undefined, SUPERNOVA_WEB_URL: web.resolvedUrls?.local[0]},
    });

    desktop.once("error", (error) => {
      console.error(error);
      process.exitCode = 1;
      void stop();
    });
    desktop.once("exit", (code) => {
      if (!stopping) {
        process.exitCode = code ?? 1;
        void stop();
      }
    });
  }

  if (stopping) {
    await web.close();
    await api?.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
  await stop();
}
