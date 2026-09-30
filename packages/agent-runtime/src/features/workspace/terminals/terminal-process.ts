import {EventBus} from "@supernova/agent-runtime/lib/event-bus";
import type {Pty, SpawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import type {Terminal, TerminalEvent} from "@supernova/contracts/terminals/schemas";

/** Output kept for clients that attach later. Enough for a few screens of scrollback without holding a build log forever. */
const HISTORY_LIMIT_BYTES = 256 * 1024;
/** How long a shell gets to exit on hangup before it is killed outright. */
const KILL_GRACE_MS = 1_000;

export interface TerminalProcessInput {
  readonly cols: number;
  readonly cwd: string;
  readonly id: string;
  readonly rows: number;
  readonly sessionId: string;
  readonly spawnPty: SpawnPty;
}

/** One shell for a session: its PTY, capped output history, and the stream attached clients read. */
export class TerminalProcess {
  public readonly cwd: string;
  public readonly id: string;
  public readonly sessionId: string;

  private readonly events = new EventBus<TerminalEvent>();
  private readonly history: string[] = [];
  private historyBytes = 0;
  private exitCode: number | undefined;
  private pty: Pty | undefined;
  private closed = false;

  private constructor(input: Omit<TerminalProcessInput, "spawnPty" | "cols" | "rows">) {
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
      onData: (data) => process.record(data),
      onExit: (exitCode) => process.exited(exitCode),
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

  /** History first, then live output until the terminal is closed or the consumer stops. */
  public watch(): AsyncGenerator<TerminalEvent, void, undefined> {
    const live = this.events.subscribe();
    const initial: TerminalEvent[] = [{type: "terminal.history", data: this.history.join("")}];
    if (this.exitCode !== undefined) initial.push({type: "terminal.exited", exitCode: this.exitCode});
    if (this.closed) initial.push({type: "terminal.closed"});
    let index = 0;
    return {
      next: () => {
        if (index < initial.length) return Promise.resolve({done: false, value: initial[index++]!});
        return live.next();
      },
      return: () => live.return(),
      throw: (error) => live.throw(error),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  /** Ends the shell as a closing terminal window would and tells watchers the terminal is gone. */
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
    this.events.publish({type: "terminal.closed"});
  }

  private record(data: string): void {
    this.history.push(data);
    this.historyBytes += data.length;
    while (this.historyBytes > HISTORY_LIMIT_BYTES && this.history.length > 1) this.historyBytes -= this.history.shift()!.length;
    this.events.publish({type: "terminal.output", data});
  }

  private exited(exitCode: number): void {
    if (this.exitCode !== undefined) return;
    this.exitCode = exitCode;
    this.events.publish({type: "terminal.exited", exitCode});
  }
}
