import {spawn} from "@lydell/node-pty";

/** The pseudo-terminal a shell runs in, from `@lydell/node-pty`. */
export interface Pty {
  readonly pid: number;
  /** Sends the signal to the shell process. */
  readonly kill: (signal: "SIGHUP" | "SIGKILL") => void;
  readonly resize: (cols: number, rows: number) => void;
  readonly write: (data: string) => void;
}

export interface SpawnPtyInput {
  readonly cols: number;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly onData: (data: string) => void;
  /** Called once, with the shell's exit code. */
  readonly onExit: (exitCode: number) => void;
  readonly rows: number;
  readonly shell: string;
}

export type SpawnPty = (input: SpawnPtyInput) => Promise<Pty>;

/** POSIX shells read their profile as a login shell; PowerShell has no such flag and rejects `-l`. */
function shellArguments(): string[] {
  return process.platform === "win32" ? [] : ["-l"];
}

/** Starts a shell in a pseudo-terminal. */
export const spawnPty: SpawnPty = async (input) => {
  const child = spawn(input.shell, shellArguments(), {cols: input.cols, cwd: input.cwd, env: input.env as Record<string, string>, name: "xterm-256color", rows: input.rows});
  child.onData(input.onData);
  child.onExit(({exitCode}) => input.onExit(exitCode));
  return {
    pid: child.pid,
    kill: (signal) => child.kill(signal),
    resize: (cols, rows) => child.resize(cols, rows),
    write: (data) => child.write(data),
  };
};
