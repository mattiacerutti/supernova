import type {MutableReplicatedState} from "@earendil-works/chord";
import {replicatedState} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {
  TerminalClosePayload,
  TerminalOpenPayload,
  TerminalOpenResult,
  TerminalResizePayload,
  TerminalsListPayload,
  TerminalsListResult,
  TerminalWritePayload,
} from "@supernova/contracts/services/workspace/procedures";
import {TerminalError, TerminalNotFoundError} from "@supernova/contracts/services/workspace/schemas";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import type {SpawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {overflow, TerminalProcess} from "@supernova/agent-runtime/features/workspace/terminals/terminal-process";

export interface TerminalsDeps {
  readonly spawnPty: SpawnPty;
}

/**
 * Shells the server runs in sessions' workspaces. A terminal lives until it is closed or its session is released;
 * clients attach and detach freely, so switching sessions never ends a shell. Nothing survives a server restart.
 * Every terminal's output is replicated state: each chunk is a string append, the cap drops from the front.
 */
export class Terminals {
  public readonly state: MutableReplicatedState<TerminalsState> = replicatedState<TerminalsState>({terminals: {}});
  /** Registered before the spawn settles, so two opens of one id (React remounts) share one shell. */
  private readonly terminals = new Map<string, Promise<TerminalProcess>>();

  public constructor(private readonly deps: TerminalsDeps) {}

  /** Starts a shell, or returns the existing terminal with that id so a reopened tab reattaches. */
  public async open(input: TerminalOpenPayload): Promise<TerminalOpenResult> {
    let pending = this.terminals.get(input.id);
    if (!pending) {
      const {id, cwd, sessionId} = input;
      // The entry exists from the open on, so output arriving before the spawn settles has a place; a closed
      // terminal's entry is gone and its late output is dropped.
      this.state.change(BACKGROUND_CONTEXT, (draft) => {
        draft.terminals[id] = {terminal: {cwd, id, sessionId}, output: "", dropped: 0};
      });
      pending = TerminalProcess.spawn({
        ...input,
        spawnPty: this.deps.spawnPty,
        onOutput: (data) =>
          this.change(id, (entry) => {
            entry.output += data;
            const dropped = overflow(entry.output);
            if (dropped > 0) {
              entry.output = entry.output.slice(dropped);
              entry.dropped += dropped;
            }
          }),
        onExit: (exitCode) =>
          this.change(id, (entry) => {
            entry.terminal.exitCode = exitCode;
          }),
      });
      this.terminals.set(id, pending);
      pending.catch(() => {
        this.terminals.delete(id);
        this.remove(id);
      });
    }
    try {
      return (await pending).snapshot();
    } catch (cause) {
      throw new TerminalError({cause, message: "Failed to start the terminal."});
    }
  }

  public async write(input: TerminalWritePayload): Promise<void> {
    (await this.get(input.id)).write(input.data);
  }

  public async resize(input: TerminalResizePayload): Promise<void> {
    (await this.get(input.id)).resize(input.cols, input.rows);
  }

  /** Kills the shell. Closing an unknown terminal is not an error; the tab is gone either way. */
  public async close(input: TerminalClosePayload): Promise<void> {
    const pending = this.terminals.get(input.id);
    if (!pending) return;
    this.terminals.delete(input.id);
    this.remove(input.id);
    (await pending.catch(() => undefined))?.close();
  }

  public async list(input: TerminalsListPayload): Promise<TerminalsListResult> {
    const terminals = await Promise.all([...this.terminals.values()].map((pending) => pending.catch(() => undefined)));
    return {terminals: terminals.filter((terminal) => terminal?.sessionId === input.sessionId).map((terminal) => terminal!.snapshot())};
  }

  /** Kills every shell of a session; runs before the session is archived and its worktree removed. */
  public async closeSession(sessionId: string): Promise<void> {
    for (const [id, pending] of [...this.terminals]) {
      const terminal = await pending.catch(() => undefined);
      if (terminal?.sessionId === sessionId) await this.close({id});
    }
  }

  /** Kills every shell on server shutdown. */
  public async dispose(): Promise<void> {
    await Promise.all([...this.terminals.keys()].map((id) => this.close({id})));
  }

  /** Changes one terminal's entry, unless it was closed. */
  private change(id: string, apply: (entry: {output: string; dropped: number; terminal: {exitCode?: number}}) => void): void {
    if (!this.state.value.terminals[id]) return;
    this.state.change(BACKGROUND_CONTEXT, (draft) => apply(draft.terminals[id]!));
  }

  private remove(id: string): void {
    if (!this.state.value.terminals[id]) return;
    this.state.change(BACKGROUND_CONTEXT, (draft) => {
      delete draft.terminals[id];
    });
  }

  private async get(id: string): Promise<TerminalProcess> {
    const pending = this.terminals.get(id);
    if (!pending) throw new TerminalNotFoundError({message: "Terminal not found."});
    return pending;
  }
}
