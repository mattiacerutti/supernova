import {spawn} from "@lydell/node-pty";

export interface Pty {
  readonly pid: number;
  readonly kill: (signal: "SIGHUP" | "SIGKILL") => void;
  readonly resize: (cols: number, rows: number) => void;
  readonly write: (data: Uint8Array) => void;
  /** The program blocks once the kernel's buffer fills. */
  readonly pause: () => void;
  readonly resume: () => void;
}

export interface SpawnPtyInput {
  readonly cols: number;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly onData: (data: Uint8Array) => void;
  readonly onExit: (exitCode: number) => void;
  readonly rows: number;
  readonly shell: string;
}

export type SpawnPty = (input: SpawnPtyInput) => Promise<Pty>;

const encoder = new TextEncoder();

/** POSIX shells read their profile as a login shell; PowerShell has no such flag and rejects `-l`. */
function shellArguments(): string[] {
  return process.platform === "win32" ? [] : ["-l"];
}

export const spawnPty: SpawnPty = async (input) => {
  // Raw bytes: output offsets count bytes, and a character split across reads stays whole for the emulator.
  const child = spawn(input.shell, shellArguments(), {
    cols: input.cols,
    cwd: input.cwd,
    encoding: null,
    env: input.env as Record<string, string>,
    name: "xterm-256color",
    rows: input.rows,
  });
  // Windows ignores `encoding: null` and always decodes to strings.
  child.onData((data: string | Buffer) => input.onData(typeof data === "string" ? encoder.encode(data) : data));
  child.onExit(({exitCode}) => input.onExit(exitCode));
  return {
    pid: child.pid,
    kill: (signal) => child.kill(process.platform === "win32" ? undefined : signal),
    resize: (cols, rows) => child.resize(cols, rows),
    write: (data) => child.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength)),
    pause: () => child.pause(),
    resume: () => child.resume(),
  };
};
