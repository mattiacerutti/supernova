import type {TerminalClosePayload, TerminalOpenPayload, TerminalOpenResult, TerminalResizePayload, TerminalWritePayload} from "@supernova/contracts/services/workspace/procedures";
import type {Terminal, TerminalOutput} from "@supernova/contracts/services/workspace/schemas";
import {TerminalError, TerminalNotFoundError} from "@supernova/contracts/services/workspace/schemas";
import type {SpawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {overflow, TerminalProcess} from "@supernova/agent-runtime/features/workspace/terminals/terminal-process";

export interface TerminalsDeps {
  readonly spawnPty: SpawnPty;
}

function nextNumber(terminals: Iterable<Terminal>, sessionId: string): number {
  const used = new Set([...terminals].flatMap((terminal) => (terminal.sessionId === sessionId ? [terminal.number] : [])));
  let number = 1;
  while (used.has(number)) number += 1;
  return number;
}

type Entry = {terminal: Terminal; readonly process: Promise<TerminalProcess>; output: TerminalOutput};

/** A terminal lives until closed or its session is released; clients attach and detach freely. */
export class Terminals {
  private readonly entries = new Map<string, Entry>();
  /** Scrollback of terminals that closed, kept for clients still showing them. */
  private readonly closed = new Map<string, TerminalOutput>();
  private readonly listeners = new Set<(change: {readonly terminalId: string}) => void>();

  public constructor(private readonly deps: TerminalsDeps) {}

  public onChange(listener: (change: {readonly terminalId: string}) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public list(): Terminal[] {
    return [...this.entries.values()].map((entry) => entry.terminal);
  }

  public output(id: string): TerminalOutput | undefined {
    return this.entries.get(id)?.output ?? this.closed.get(id);
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
      this.closed.delete(id);
      this.entries.set(id, entry);
      this.emit(id);
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

  public async write(input: TerminalWritePayload): Promise<void> {
    (await this.process(input.id)).write(input.data);
  }

  public async resize(input: TerminalResizePayload): Promise<void> {
    (await this.process(input.id)).resize(input.cols, input.rows);
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

  public async dispose(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((id) => this.close({id})));
  }

  /** Replaced, never edited: published values compare by identity. */
  private append(id: string, data: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    const grown = entry.output.output + data;
    const dropped = overflow(grown);
    entry.output = {...entry.output, output: dropped === 0 ? grown : grown.slice(dropped), dropped: entry.output.dropped + dropped};
    this.emit(id);
  }

  private exited(id: string, exitCode: number): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.terminal = {...entry.terminal, exitCode};
    entry.output = {...entry.output, exitCode};
    this.emit(id);
  }

  private emit(terminalId: string): void {
    for (const listener of [...this.listeners]) listener({terminalId});
  }

  private remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    this.closed.set(id, {...entry.output, closed: true});
    this.emit(id);
  }

  private async process(id: string): Promise<TerminalProcess> {
    const entry = this.entries.get(id);
    if (!entry) throw new TerminalNotFoundError({message: "Terminal not found."});
    return entry.process;
  }
}
