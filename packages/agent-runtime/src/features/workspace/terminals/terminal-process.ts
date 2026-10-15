import type {Pty, SpawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {userProcessEnv} from "@supernova/agent-runtime/lib/user-process-env";

/** Output kept for clients that attach later. Enough for a few screens of scrollback without holding a build log forever. */
const HISTORY_LIMIT_CHARS = 256 * 1024;
const KILL_GRACE_MS = 1_000;
/** A busy PTY delivers hundreds of reads per second; each published alone is a revision, a frame, and a redraw. */
const OUTPUT_COALESCE_MS = 8;
const OUTPUT_COALESCE_CHARS = 32 * 1024;

export interface TerminalProcessInput {
  readonly cols: number;
  readonly cwd: string;
  readonly id: string;
  readonly rows: number;
  readonly sessionId: string;
  readonly spawnPty: SpawnPty;
  readonly onOutput: (data: string) => void;
  readonly onExit: (exitCode: number) => void;
}

export class TerminalProcess {
  private exitCode: number | undefined;
  private pty: Pty | undefined;
  private closed = false;

  public static async spawn(input: TerminalProcessInput): Promise<TerminalProcess> {
    const process = new TerminalProcess();
    let pending = "";
    let flushTimer: NodeJS.Timeout | undefined;
    const flush = (): void => {
      clearTimeout(flushTimer);
      flushTimer = undefined;
      if (pending.length === 0) return;
      const data = pending;
      pending = "";
      input.onOutput(data);
    };
    process.pty = await input.spawnPty({
      cols: input.cols,
      cwd: input.cwd,
      env: {...userProcessEnv(), SUPERNOVA_SESSION_ID: input.sessionId, TERM: "xterm-256color"},
      onData: (data) => {
        pending += data;
        if (pending.length >= OUTPUT_COALESCE_CHARS) flush();
        else flushTimer ??= setTimeout(flush, OUTPUT_COALESCE_MS);
      },
      onExit: (exitCode) => {
        if (process.exitCode !== undefined) return;
        // The last output must land before the exit code, or the client draws the exit notice above it.
        flush();
        process.exitCode = exitCode;
        input.onExit(exitCode);
      },
      rows: input.rows,
      shell: globalThis.process.env.SHELL || (globalThis.process.platform === "win32" ? "powershell.exe" : "/bin/sh"),
    });
    return process;
  }

  public write(data: string): void {
    if (this.exitCode === undefined) this.pty?.write(data);
  }

  public resize(cols: number, rows: number): void {
    if (this.exitCode === undefined) this.pty?.resize(cols, rows);
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.exitCode === undefined && this.pty) {
      // Interactive shells ignore SIGTERM; SIGHUP is what losing the terminal means to them.
      const pty = this.pty;
      pty.kill("SIGHUP");
      setTimeout(() => {
        if (this.exitCode === undefined) pty.kill("SIGKILL");
      }, KILL_GRACE_MS).unref();
    }
  }
}

export function overflow(output: string): number {
  return Math.max(0, output.length - HISTORY_LIMIT_CHARS);
}
