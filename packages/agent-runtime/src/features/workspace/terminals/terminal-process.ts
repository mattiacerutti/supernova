import type {Pty, SpawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import type {Terminal} from "@supernova/contracts/terminals/schemas";

/** Output kept for clients that attach later. Enough for a few screens of scrollback without holding a build log forever. */
const HISTORY_LIMIT_CHARS = 256 * 1024;
/** How long a shell gets to exit on hangup before it is killed outright. */
const KILL_GRACE_MS = 1_000;

export interface TerminalProcessInput {
  readonly cols: number;
  readonly cwd: string;
  readonly id: string;
  readonly rows: number;
  readonly sessionId: string;
  readonly spawnPty: SpawnPty;
  /** Receives every output chunk and the exit; the owner publishes them. */
  readonly onOutput: (data: string) => void;
  readonly onExit: (exitCode: number) => void;
}

/** One shell for a session: its PTY and the capped output history attached clients see. */
export class TerminalProcess {
  public readonly cwd: string;
  public readonly id: string;
  public readonly sessionId: string;

  private exitCode: number | undefined;
  private pty: Pty | undefined;
  private closed = false;

  private constructor(input: Pick<TerminalProcessInput, "cwd" | "id" | "sessionId">) {
    this.cwd = input.cwd;
    this.id = input.id;
    this.sessionId = input.sessionId;
  }

  /** Spawns the user's shell in `cwd`. */
  public static async spawn(input: TerminalProcessInput): Promise<TerminalProcess> {
    const process = new TerminalProcess(input);
    process.pty = await input.spawnPty({
      cols: input.cols,
      cwd: input.cwd,
      env: {...globalThis.process.env, SUPERNOVA_SESSION_ID: input.sessionId, TERM: "xterm-256color"},
      onData: (data) => input.onOutput(data),
      onExit: (exitCode) => {
        if (process.exitCode !== undefined) return;
        process.exitCode = exitCode;
        input.onExit(exitCode);
      },
      rows: input.rows,
      shell: globalThis.process.env.SHELL || (globalThis.process.platform === "win32" ? "powershell.exe" : "/bin/sh"),
    });
    return process;
  }

  public snapshot(): Terminal {
    return {cwd: this.cwd, id: this.id, sessionId: this.sessionId, ...(this.exitCode === undefined ? {} : {exitCode: this.exitCode})};
  }

  public write(data: string): void {
    if (this.exitCode === undefined) this.pty?.write(data);
  }

  public resize(cols: number, rows: number): void {
    if (this.exitCode === undefined) this.pty?.resize(cols, rows);
  }

  /** Ends the shell as a closing terminal window would. */
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

/** Characters to drop from the front of `output` so it stays within the history cap. */
export function overflow(output: string): number {
  return Math.max(0, output.length - HISTORY_LIMIT_CHARS);
}
