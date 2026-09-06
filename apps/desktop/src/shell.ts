import {spawnSync} from "node:child_process";
import type {SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns} from "node:child_process";
import {randomUUID} from "node:crypto";
import {userInfo} from "node:os";
import {basename} from "node:path";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const ELECTRON_VARIABLES = ["ELECTRON_RUN_AS_NODE", "ELECTRON_NO_ATTACH_CONSOLE"] as const;

interface ShellAttempt {
  args: string[];
  argv0?: string;
}

/** Uses each shell's command syntax and, where supported, retries without interactive startup files. */
function shellCommand(shell: string, marker: string): {command: string; attempts: ShellAttempt[]} {
  const name = basename(shell);
  const script = `process.stdout.write(\`${marker}\` + JSON.stringify(process.env) + \`${marker}\`)`;
  const executable = `'${process.execPath.replaceAll("'", "'\\''")}'`;
  let command = `${executable} -e '${script}'`;

  if (/^(?:pwsh|powershell)(?:-preview)?$/.test(name)) {
    command = `& '${process.execPath.replaceAll("'", "''")}' -e '${script}'`;
    return {command, attempts: [{args: ["-Login", "-Command"]}]};
  }

  if (name === "nu") {
    command = `^${JSON.stringify(process.execPath)} -e '${script}'`;
  } else if (name === "xonsh") {
    command = `import os, json; print("${marker}" + json.dumps(dict(os.environ)) + "${marker}")`;
  } else if (name === "csh" || name === "tcsh") {
    return {command, attempts: [{args: ["-ic"]}, {args: ["-c"], argv0: `-${name}`}]};
  }

  return {command, attempts: [{args: ["-i", "-l", "-c"]}, {args: ["-l", "-c"]}]};
}

/** Ignores shell banners and validates the complete payload before changing the app's environment. */
function parseEnvironment(stdout: string, marker: string): Record<string, string> {
  const start = stdout.indexOf(marker);
  const end = stdout.indexOf(marker, start + marker.length);
  if (start < 0 || end < 0) throw new Error("missing environment markers");

  let environment: unknown;
  try {
    environment = JSON.parse(stdout.slice(start + marker.length, end));
  } catch {
    // JSON errors can include environment values; never put those in diagnostics.
    throw new Error("invalid environment JSON");
  }

  if (!environment || typeof environment !== "object" || Array.isArray(environment)) throw new Error("invalid environment object");
  for (const [key, value] of Object.entries(environment)) {
    if (!key || key.includes("=") || key.includes("\0") || typeof value !== "string" || value.includes("\0")) {
      throw new Error("invalid environment entry");
    }
  }

  return environment as Record<string, string>;
}

interface SyncShellEnvironmentOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly getUserShell?: () => string | null;
  readonly spawn?: (shell: string, args: string[], options: SpawnSyncOptionsWithStringEncoding) => SpawnSyncReturns<string>;
  readonly warn?: (message: string) => void;
}

/** Imports the full login-shell environment for GUI launches, keeping inherited values if both attempts fail. */
export function syncShellEnvironment({
  env = process.env,
  platform = process.platform,
  getUserShell,
  spawn = spawnSync,
  warn = console.warn,
}: SyncShellEnvironmentOptions = {}): void {
  if (platform === "win32") return;

  let shell = env.SHELL;
  if (!shell) {
    try {
      shell = (getUserShell ? getUserShell() : userInfo().shell) ?? undefined;
    } catch {
      // Account lookup can fail in restricted environments; use the platform default.
    }
    if (!shell || shell === "/bin/false") shell = platform === "darwin" ? "/bin/zsh" : "/bin/bash";
  }

  const configuredTimeout = Number(env.SUPERNOVA_SHELL_ENV_TIMEOUT_MS);
  const timeout = Number.isInteger(configuredTimeout) && configuredTimeout > 0 && configuredTimeout <= MAX_TIMEOUT_MS ? configuredTimeout : DEFAULT_TIMEOUT_MS;
  const deadline = performance.now() + timeout;
  const marker = randomUUID();
  const {command, attempts} = shellCommand(shell, marker);
  const shellEnv = {...env, ELECTRON_RUN_AS_NODE: "1", ELECTRON_NO_ATTACH_CONSOLE: "1"};

  for (const [index, attempt] of attempts.entries()) {
    const remaining = Math.ceil(deadline - performance.now());
    if (remaining <= 0) {
      warn("[shell] Login-shell environment lookup timed out; keeping the inherited environment.");
      return;
    }

    // Reserve time for a non-interactive retry within the same overall deadline.
    const budget = index === 0 && attempts.length > 1 ? Math.min(remaining, Math.max(1, Math.floor(timeout / 2))) : remaining;

    try {
      const result = spawn(shell, [...attempt.args, command], {
        argv0: attempt.argv0,
        encoding: "utf8",
        env: shellEnv,
        timeout: budget,
        killSignal: "SIGKILL",
        windowsHide: true,
      });
      if (result.error || result.signal || result.status !== 0) {
        const reason = (result.error as NodeJS.ErrnoException | undefined)?.code ?? result.signal ?? `exit ${result.status}`;
        throw new Error(`shell process failed (${reason})`);
      }

      const environment = parseEnvironment(result.stdout, marker);
      for (const key of ELECTRON_VARIABLES) {
        if (env[key] === undefined) delete environment[key];
        else environment[key] = env[key];
      }
      // Keep the GUI session's runtime directory, not one introduced by a login shell.
      delete environment.XDG_RUNTIME_DIR;

      Object.assign(env, environment);
      return;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      const action = index + 1 < attempts.length ? "retrying without interactive mode" : "keeping the inherited environment";
      warn(`[shell] Could not read the environment from ${shell}: ${reason}; ${action}.`);
    }
  }
}
