import {fork} from "node:child_process";

export interface ServerProcess {
  readonly url: string;
  readonly exited: Promise<void>;
  readonly close: () => Promise<void>;
}

export interface StartServerProcessOptions {
  readonly entry: string;
  readonly execPath: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly port?: number;
}

/** Owns a local API child, with IPC readiness and bounded shutdown. Never discovers or reuses another process. */
export async function startServerProcess({entry, execPath, env, port = 0}: StartServerProcessOptions): Promise<ServerProcess> {
  const child = fork(entry, ["--host", "127.0.0.1", "--port", String(port)], {
    execPath,
    execArgv: [],
    env: {...process.env, ...env},
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  let closing: Promise<void> | undefined;

  const close = (): Promise<void> => {
    closing ??= (async () => {
      if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;

      child.kill("SIGTERM");
      const deadline = setTimeout(() => child.kill("SIGKILL"), 5_000);

      try {
        await exited;
      } finally {
        clearTimeout(deadline);
      }
    })();

    return closing;
  };

  let cleanupStartup: (() => void) | undefined;

  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for the Supernova API.")), 15_000);

      const onExit = (code: number | null, signal: string | null): void => {
        reject(new Error(`Supernova API exited before readiness (code=${code}, signal=${signal}).`));
      };

      const onMessage = (message: unknown): void => {
        if (!message || typeof message !== "object" || !("type" in message) || message.type !== "ready") return;
        if (!("url" in message) || typeof message.url !== "string") return;

        try {
          const endpoint = new URL(message.url);
          if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || !endpoint.port) {
            throw new Error("Invalid local API endpoint.");
          }

          resolve(endpoint.origin);
        } catch (error) {
          reject(error);
        }
      };

      child.once("error", reject);
      child.once("exit", onExit);
      child.on("message", onMessage);

      cleanupStartup = () => {
        clearTimeout(timeout);
        child.removeListener("error", reject);
        child.removeListener("exit", onExit);
        child.removeListener("message", onMessage);
      };
    });

    return {url, exited, close};
  } catch (error) {
    await close();
    throw error;
  } finally {
    cleanupStartup?.();
  }
}
