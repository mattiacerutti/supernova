import type {Draft, MutableReplicatedState} from "@earendil-works/chord";
import {replicatedState} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {TerminalClosePayload, TerminalOpenPayload, TerminalOpenResult, TerminalResizePayload, TerminalWritePayload} from "@supernova/contracts/services/workspace/procedures";
import type {Terminal, TerminalOutput} from "@supernova/contracts/services/workspace/schemas";
import {TerminalError, TerminalNotFoundError} from "@supernova/contracts/services/workspace/schemas";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import type {SpawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {overflow, TerminalProcess} from "@supernova/agent-runtime/features/workspace/terminals/terminal-process";

export interface TerminalsDeps {
  readonly spawnPty: SpawnPty;
}

interface TerminalEntry {
  readonly process: Promise<TerminalProcess>;
  readonly output: MutableReplicatedState<TerminalOutput>;
}

function nextNumber(terminals: Readonly<Record<string, Terminal>>, sessionId: string): number {
  const used = new Set(Object.values(terminals).flatMap((terminal) => (terminal.sessionId === sessionId ? [terminal.number] : [])));
  let number = 1;
  while (used.has(number)) number += 1;
  return number;
}

/** A terminal lives until closed or its session is released; clients attach and detach freely. */
export class Terminals {
  public readonly state: MutableReplicatedState<TerminalsState> = replicatedState<TerminalsState>({terminals: {}});
  private readonly entries = new Map<string, TerminalEntry>();

  public constructor(private readonly deps: TerminalsDeps) {}

  public async open(input: TerminalOpenPayload): Promise<TerminalOpenResult> {
    let entry = this.entries.get(input.id);
    if (!entry) {
      const {id, cwd, sessionId} = input;
      const terminal: Terminal = {cwd, id, number: nextNumber(this.state.value.terminals, sessionId), sessionId, startedAt: new Date().toISOString()};
      this.state.change(BACKGROUND_CONTEXT, (draft) => {
        draft.terminals[id] = terminal;
      });
      const output = replicatedState<TerminalOutput>({output: "", dropped: 0});
      const process = TerminalProcess.spawn({
        ...input,
        spawnPty: this.deps.spawnPty,
        onOutput: (data) =>
          this.changeOutput(id, (draft) => {
            draft.output += data;
            const dropped = overflow(draft.output);
            if (dropped > 0) {
              draft.output = draft.output.slice(dropped);
              draft.dropped += dropped;
            }
          }),
        onExit: (exitCode) => {
          this.changeOutput(id, (draft) => {
            draft.exitCode = exitCode;
          });
          if (!this.state.value.terminals[id]) return;
          this.state.change(BACKGROUND_CONTEXT, (draft) => {
            draft.terminals[id]!.exitCode = exitCode;
          });
        },
      });
      entry = {output, process};
      this.entries.set(id, entry);
      process.catch(() => this.remove(id));
    }
    try {
      await entry.process;
    } catch (cause) {
      throw new TerminalError({cause, message: "Failed to start the terminal."});
    }
    const terminal = this.state.value.terminals[input.id];
    if (!terminal) throw new TerminalNotFoundError({message: "Terminal not found."});
    return terminal;
  }

  public output(id: string): MutableReplicatedState<TerminalOutput> {
    const entry = this.entries.get(id);
    if (!entry) throw new TerminalNotFoundError({message: "Terminal not found."});
    return entry.output;
  }

  public async write(input: TerminalWritePayload): Promise<void> {
    (await this.process(input.id)).write(input.data);
  }

  public async resize(input: TerminalResizePayload): Promise<void> {
    (await this.process(input.id)).resize(input.cols, input.rows);
  }

  public async close(input: TerminalClosePayload): Promise<void> {
    const entry = this.entries.get(input.id);
    if (!entry) return;
    this.remove(input.id);
    (await entry.process.catch(() => undefined))?.close();
  }

  public async closeSession(sessionId: string): Promise<void> {
    const ids = Object.values(this.state.value.terminals).flatMap((terminal) => (terminal.sessionId === sessionId ? [terminal.id] : []));
    await Promise.all(ids.map((id) => this.close({id})));
  }

  public async dispose(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((id) => this.close({id})));
  }

  private changeOutput(id: string, apply: (draft: Draft<TerminalOutput>) => void): void {
    this.entries.get(id)?.output.change(BACKGROUND_CONTEXT, apply);
  }

  private remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    entry.output.change(BACKGROUND_CONTEXT, (draft) => {
      draft.closed = true;
    });
    if (!this.state.value.terminals[id]) return;
    this.state.change(BACKGROUND_CONTEXT, (draft) => {
      delete draft.terminals[id];
    });
  }

  private async process(id: string): Promise<TerminalProcess> {
    const entry = this.entries.get(id);
    if (!entry) throw new TerminalNotFoundError({message: "Terminal not found."});
    return entry.process;
  }
}
