import type {
  TerminalClosePayload,
  TerminalOpenPayload,
  TerminalOpenResult,
  TerminalResizePayload,
  TerminalsListPayload,
  TerminalsListResult,
  TerminalWatchPayload,
  TerminalWritePayload,
} from "@supernova/contracts/terminals/procedures";
import {TerminalError, TerminalNotFoundError} from "@supernova/contracts/terminals/schemas";
import type {TerminalEvent} from "@supernova/contracts/terminals/schemas";
import type {SpawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {TerminalProcess} from "@supernova/agent-runtime/features/workspace/terminals/terminal-process";

export interface TerminalsDeps {
  readonly spawnPty: SpawnPty;
}

/**
 * Shells the server runs in sessions' workspaces. A terminal lives until it is closed or its session is released;
 * clients attach and detach freely, so switching sessions never ends a shell. Nothing survives a server restart.
 */
export class Terminals {
  /** Registered before the spawn settles, so two opens of one id (React remounts) share one shell. */
  private readonly terminals = new Map<string, Promise<TerminalProcess>>();

  public constructor(private readonly deps: TerminalsDeps) {}

  /** Starts a shell, or returns the existing terminal with that id so a reopened tab reattaches. */
  public async open(input: TerminalOpenPayload): Promise<TerminalOpenResult> {
    let pending = this.terminals.get(input.id);
    if (!pending) {
      pending = TerminalProcess.spawn({...input, spawnPty: this.deps.spawnPty});
      this.terminals.set(input.id, pending);
      pending.catch(() => this.terminals.delete(input.id));
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
    (await pending.catch(() => undefined))?.close();
  }

  public async list(input: TerminalsListPayload): Promise<TerminalsListResult> {
    const terminals = await Promise.all([...this.terminals.values()].map((pending) => pending.catch(() => undefined)));
    return {terminals: terminals.filter((terminal) => terminal?.sessionId === input.sessionId).map((terminal) => terminal!.snapshot())};
  }

  public async watch(input: TerminalWatchPayload): Promise<AsyncGenerator<TerminalEvent, void, undefined>> {
    return (await this.get(input.id)).watch();
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

  private async get(id: string): Promise<TerminalProcess> {
    const pending = this.terminals.get(id);
    if (!pending) throw new TerminalNotFoundError({message: "Terminal not found."});
    return pending;
  }
}
