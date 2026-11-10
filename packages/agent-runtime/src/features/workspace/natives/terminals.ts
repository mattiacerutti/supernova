import type {TerminalClosePayload, TerminalOpenPayload, TerminalOpenResult, TerminalResizePayload, TerminalWritePayload} from "@supernova/contracts/services/workspace/procedures";
import type {Terminal, TerminalOutput} from "@supernova/contracts/services/workspace/schemas";
import {TerminalError, TerminalNotFoundError} from "@supernova/contracts/services/workspace/schemas";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import type {Published} from "@supernova/agent-runtime/lib/chord/state";
import type {SpawnPty} from "@supernova/agent-runtime/features/workspace/lib/pty";
import {overflow, TerminalProcess} from "@supernova/agent-runtime/features/workspace/natives/terminal-process";

export interface TerminalsDeps {
  readonly spawnPty: SpawnPty;
  readonly list: Published<TerminalsState>;
  readonly outputs: Published<Readonly<Record<string, TerminalOutput>>>;
}

function nextNumber(terminals: Iterable<Terminal>, sessionId: string): number {
  const used = new Set([...terminals].flatMap((terminal) => (terminal.sessionId === sessionId ? [terminal.number] : [])));
  let number = 1;
  while (used.has(number)) number += 1;
  return number;
}

type Entry = {terminal: Terminal; readonly process: Promise<TerminalProcess>; output: TerminalOutput};

export class Terminals {
  private readonly deps: TerminalsDeps;
  private readonly entries = new Map<string, Entry>();
  private published = true;

  public constructor(deps: TerminalsDeps) {
    this.deps = deps;
  }

  public list(): Terminal[] {
    return [...this.entries.values()].map((entry) => entry.terminal);
  }

  public has(id: string): boolean {
    return this.entries.has(id);
  }

  public async open(input: TerminalOpenPayload): Promise<TerminalOpenResult> {
    let entry = this.entries.get(input.id);
    if (!entry) {
      const {id, cwd, sessionId} = input;
      const terminal: Terminal = {cwd, id, number: nextNumber(this.list(), sessionId), sessionId, startedAt: new Date().toISOString()};
      const process = TerminalProcess.spawn({
        ...input,
        spawnPty: this.deps.spawnPty,
        onOutput: (data) => this.append(id, data),
        onExit: (exitCode) => this.exited(id, exitCode),
      });
      entry = {terminal, process, output: {output: "", dropped: 0}};
      this.entries.set(id, entry);
      this.publishList();
      this.publishOutput(id, entry.output);
      process.catch(() => this.remove(id));
    }
    try {
      await entry.process;
    } catch (cause) {
      throw new TerminalError({cause, message: "Failed to start the terminal."});
    }
    if (!this.entries.has(input.id)) throw new TerminalNotFoundError({message: "Terminal not found."});
    return entry.terminal;
  }

  public async write(id: string, input: TerminalWritePayload): Promise<void> {
    (await this.process(id)).write(input.data);
  }

  public async resize(id: string, input: TerminalResizePayload): Promise<void> {
    (await this.process(id)).resize(input.cols, input.rows);
  }

  public async close(input: TerminalClosePayload): Promise<void> {
    const entry = this.entries.get(input.id);
    if (!entry) return;
    await (await entry.process.catch(() => undefined))?.close();
    this.remove(input.id);
  }

  public async closeSession(sessionId: string): Promise<void> {
    const ids = this.list().flatMap((terminal) => (terminal.sessionId === sessionId ? [terminal.id] : []));
    await Promise.all(ids.map((id) => this.close({id})));
  }

  // Its object ended, so nobody reads what the closing shells still report.
  public async shutdown(): Promise<void> {
    this.published = false;
    await this.dispose();
  }

  public async dispose(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((id) => this.close({id})));
  }

  // Replaced, never edited: published values compare by identity.
  private append(id: string, data: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    const grown = entry.output.output + data;
    const dropped = overflow(grown);
    entry.output = {...entry.output, output: dropped === 0 ? grown : grown.slice(dropped), dropped: entry.output.dropped + dropped};
    this.publishOutput(id, entry.output);
  }

  private exited(id: string, exitCode: number): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.terminal = {...entry.terminal, exitCode};
    entry.output = {...entry.output, exitCode};
    this.publishList();
    this.publishOutput(id, entry.output);
  }

  private remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    this.publishList();
    // Kept for clients still showing it.
    this.publishOutput(id, {...entry.output, closed: true});
  }

  private publishList(): void {
    if (!this.published) return;
    this.deps.list.set({terminals: Object.fromEntries([...this.entries].map(([id, entry]) => [id, entry.terminal]))});
  }

  private publishOutput(id: string, output: TerminalOutput): void {
    if (!this.published) return;
    this.deps.outputs.set({...this.deps.outputs.value, [id]: output});
  }

  private async process(id: string): Promise<TerminalProcess> {
    const entry = this.entries.get(id);
    if (!entry) throw new TerminalNotFoundError({message: "Terminal not found."});
    return entry.process;
  }
}
