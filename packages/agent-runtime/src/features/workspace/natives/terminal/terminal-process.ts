import type {Pty, SpawnPty} from "@supernova/agent-runtime/features/workspace/lib/terminal/pty";
import {userProcessEnv} from "@supernova/agent-runtime/lib/user-process-env";

const KILL_GRACE_MS = 1_000;

export interface TerminalProcessInput {
  readonly cols: number;
  readonly cwd: string;
  readonly rows: number;
  readonly scheme: "light" | "dark";
  readonly sessionId: string;
  readonly spawnPty: SpawnPty;
  readonly onOutput: (data: Uint8Array) => void;
  readonly onExit: (exitCode: number) => void;
}

export class TerminalProcess {
  private exitCode: number | undefined;
  private pty: Pty | undefined;
  private resolveExit!: () => void;
  private readonly exited = new Promise<void>((resolve) => {
    this.resolveExit = resolve;
  });
  private closing: Promise<void> | undefined;

  public static async spawn(input: TerminalProcessInput): Promise<TerminalProcess> {
    const process = new TerminalProcess();
    process.pty = await input.spawnPty({
      cols: input.cols,
      cwd: input.cwd,
      env: {...userProcessEnv(), COLORFGBG: input.scheme === "dark" ? "15;0" : "0;15", SUPERNOVA_SESSION_ID: input.sessionId, TERM: "xterm-256color"},
      onData: input.onOutput,
      onExit: (exitCode) => {
        if (process.exitCode !== undefined) return;
        process.exitCode = exitCode;
        process.resolveExit();
        input.onExit(exitCode);
      },
      rows: input.rows,
      shell: globalThis.process.env.SHELL || (globalThis.process.platform === "win32" ? "powershell.exe" : "/bin/sh"),
    });
    return process;
  }

  public write(data: Uint8Array): void {
    if (this.exitCode === undefined) this.pty?.write(data);
  }

  public resize(cols: number, rows: number): void {
    if (this.exitCode === undefined) this.pty?.resize(cols, rows);
  }

  public pause(): void {
    if (this.exitCode === undefined) this.pty?.pause();
  }

  public resume(): void {
    if (this.exitCode === undefined) this.pty?.resume();
  }

  public close(): Promise<void> {
    this.closing ??= (async () => {
      if (this.exitCode !== undefined || !this.pty) return;
      const pty = this.pty;
      const forceKill = setTimeout(() => {
        if (this.exitCode === undefined) pty.kill("SIGKILL");
      }, KILL_GRACE_MS).unref();
      try {
        // Interactive POSIX shells ignore SIGTERM; the PTY adapter translates termination on Windows.
        pty.kill("SIGHUP");
        await this.exited;
      } finally {
        clearTimeout(forceKill);
      }
    })();
    return this.closing;
  }
}
