/**
 * The pseudo-terminal a shell runs in. Bun has a built-in PTY; under Node (the packaged desktop app runs the
 * server with Electron's Node) `@lydell/node-pty` provides one. Both are adapted to this shape.
 */
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

interface BunTerminal {
  close(): void;
  resize(cols: number, rows: number): void;
  write(data: string): number;
}

interface BunGlobal {
  Terminal: new (options: {cols: number; rows: number; name: string; data: (terminal: BunTerminal, data: Uint8Array) => void}) => BunTerminal;
  spawn: (
    command: string[],
    options: {cwd: string; env: NodeJS.ProcessEnv; terminal: BunTerminal; onExit: (subprocess: unknown, exitCode: number | null, signalCode: number | null) => void}
  ) => {pid: number; kill: (signal?: number | string) => void};
}

function spawnBunPty(bun: BunGlobal, input: SpawnPtyInput): Pty {
  const decoder = new TextDecoder();
  const terminal = new bun.Terminal({
    cols: input.cols,
    rows: input.rows,
    name: "xterm-256color",
    data: (_terminal, data) => input.onData(decoder.decode(data, {stream: true})),
  });
  const subprocess = bun.spawn([input.shell, ...shellArguments()], {
    cwd: input.cwd,
    env: input.env,
    terminal,
    onExit: (_subprocess, exitCode) => {
      terminal.close();
      input.onExit(exitCode ?? 1);
    },
  });
  return {
    pid: subprocess.pid,
    kill: (signal) => subprocess.kill(signal),
    resize: (cols, rows) => {
      terminal.resize(cols, rows);
      // Bun sets the PTY size but does not tell the shell; without SIGWINCH it keeps drawing at the old width.
      subprocess.kill("SIGWINCH");
    },
    write: (data) => void terminal.write(data),
  };
}

async function spawnNodePty(input: SpawnPtyInput): Promise<Pty> {
  const pty = await import("@lydell/node-pty");
  const child = pty.spawn(input.shell, shellArguments(), {cols: input.cols, cwd: input.cwd, env: input.env as Record<string, string>, name: "xterm-256color", rows: input.rows});
  child.onData(input.onData);
  child.onExit(({exitCode}) => input.onExit(exitCode));
  return {
    pid: child.pid,
    kill: (signal) => child.kill(signal),
    resize: (cols, rows) => child.resize(cols, rows),
    write: (data) => child.write(data),
  };
}

/** Picks the PTY implementation for the current runtime. */
export function createSpawnPty(): SpawnPty {
  const bun = (globalThis as {Bun?: BunGlobal}).Bun;
  if (bun?.Terminal) return async (input) => spawnBunPty(bun, input);
  return spawnNodePty;
}
