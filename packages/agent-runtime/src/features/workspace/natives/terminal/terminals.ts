import {randomBytes} from "node:crypto";
import type {TerminalClosePayload, TerminalOpenPayload, TerminalOpenResult, TerminalResizePayload, TerminalThemePayload} from "@supernova/contracts/services/workspace/procedures";
import type {Terminal} from "@supernova/contracts/services/workspace/schemas";
import {TERMINAL_CLOSED_CODE, TERMINAL_RETRY_CODE, TerminalError, TerminalNotFoundError} from "@supernova/contracts/services/workspace/schemas";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import type {Published} from "@supernova/agent-runtime/lib/chord/state";
import type {SpawnPty} from "@supernova/agent-runtime/features/workspace/lib/terminal/pty";
import {TerminalProcess} from "@supernova/agent-runtime/features/workspace/natives/terminal/terminal-process";
import {TerminalScreen} from "@supernova/agent-runtime/features/workspace/natives/terminal/terminal-screen";
import type {TerminalSocket} from "@supernova/agent-runtime/features/workspace/natives/terminal/terminal-viewer";
import {TerminalViewer} from "@supernova/agent-runtime/features/workspace/natives/terminal/terminal-viewer";

const TOKEN_TTL_MS = 30_000;
const DEFAULT_THEME: TerminalThemePayload = {background: 0x141414, foreground: 0xe6e6e6, scheme: "dark"};
/** Past this, the shell is paused, so parsing rather than memory bounds a flood. */
const SCREEN_BACKLOG = 1024 * 1024;

export interface TerminalsDeps {
  readonly spawnPty: SpawnPty;
  readonly list: Published<TerminalsState>;
}

export type TerminalAdmission = {readonly kind: "admitted"} | {readonly kind: "refused"; readonly status: 403 | 404};

type Entry = {
  terminal: Terminal;
  readonly process: Promise<TerminalProcess>;
  readonly screen: TerminalScreen;
  readonly viewers: Set<TerminalViewer>;
  cols: number;
  rows: number;
  paused: boolean;
  /** Its viewers have been told; a viewer that attaches later is told after its snapshot. */
  exitNotified: boolean;
};

/** The entry, not its id: a terminal reopened under the same id is another terminal. */
type Grant = {readonly entry: Entry; readonly expires: number; readonly owner: object};

const encoder = new TextEncoder();

function nextNumber(terminals: Iterable<Terminal>, sessionId: string): number {
  const used = new Set([...terminals].flatMap((terminal) => (terminal.sessionId === sessionId ? [terminal.number] : [])));
  let number = 1;
  while (used.has(number)) number += 1;
  return number;
}

export class Terminals {
  private readonly deps: TerminalsDeps;
  private readonly entries = new Map<string, Entry>();
  private readonly grants = new Map<string, Grant>();
  private readonly owned = new Map<object, Set<TerminalViewer>>();
  private theme = DEFAULT_THEME;
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
      const {id, cwd, sessionId, cols, rows} = input;
      const terminal: Terminal = {cwd, id, number: nextNumber(this.list(), sessionId), sessionId, startedAt: new Date().toISOString()};
      // Callbacks reach this entry, not whatever holds the id by then; none runs before it is set below.
      const created = {} as {current: Entry};
      const process = TerminalProcess.spawn({
        cols,
        cwd,
        rows,
        scheme: this.theme.scheme,
        sessionId,
        spawnPty: this.deps.spawnPty,
        onOutput: (data) => this.output(created.current, data),
        onExit: (exitCode) => this.exited(created.current, exitCode),
      });
      const screen = new TerminalScreen(
        cols,
        rows,
        this.theme,
        (reply) =>
          void process.then(
            (opened) => opened.write(encoder.encode(reply)),
            () => undefined
          )
      );
      created.current = {terminal, process, screen, viewers: new Set(), cols, rows, paused: false, exitNotified: false};
      entry = created.current;
      this.entries.set(id, entry);
      this.publishList();
      process.catch(() => this.remove(created.current));
    }
    try {
      await entry.process;
    } catch (cause) {
      throw new TerminalError({cause, message: "Failed to start the terminal."});
    }
    if (!this.entries.has(input.id)) throw new TerminalNotFoundError({message: "Terminal not found."});
    return entry.terminal;
  }

  public async resize(id: string, input: TerminalResizePayload): Promise<void> {
    const entry = this.entry(id);
    const process = await entry.process;
    if (entry.cols === input.cols && entry.rows === input.rows) return;
    process.resize(input.cols, input.rows);
    entry.screen.resize(input.cols, input.rows);
    entry.cols = input.cols;
    entry.rows = input.rows;
  }

  /** With several viewers, the last to report wins, as with the size. */
  public setTheme(id: string, theme: TerminalThemePayload): void {
    this.entry(id).screen.setTheme(theme);
    this.theme = theme;
  }

  /** `owner` is the `hold` whose `release` ends the viewers this token admits. */
  public grant(id: string, owner: object): string {
    const entry = this.entry(id);
    const now = Date.now();
    for (const [token, grant] of this.grants) if (grant.expires < now) this.grants.delete(token);
    const token = randomBytes(24).toString("base64url");
    this.grants.set(token, {entry, expires: now + TOKEN_TTL_MS, owner});
    return token;
  }

  /** Before the upgrade, so a refusal is an HTTP status, not a closed socket. */
  public admit(token: string): TerminalAdmission {
    const grant = this.grants.get(token);
    if (!grant || grant.expires < Date.now() || !this.owned.has(grant.owner)) return {kind: "refused", status: 403};
    if (!this.isCurrent(grant.entry)) return {kind: "refused", status: 404};
    return {kind: "admitted"};
  }

  public connect(token: string, socket: TerminalSocket): void {
    const grant = this.grants.get(token);
    this.grants.delete(token);
    const viewers = grant && this.owned.get(grant.owner);
    if (!grant || !this.isCurrent(grant.entry)) return socket.close(TERMINAL_CLOSED_CODE);
    // The terminal still runs; a new token from the hold, if it still has one, reconnects.
    if (!viewers || grant.expires < Date.now()) return socket.close(TERMINAL_RETRY_CODE);
    const {entry} = grant;
    const viewer: TerminalViewer = new TerminalViewer(socket, {
      // A shell that failed to start is removed, which closes this viewer.
      input: (bytes) =>
        void entry.process.then(
          (process) => process.write(bytes),
          () => undefined
        ),
      catchUp: () => this.snapshot(entry, viewer),
      closed: () => {
        entry.viewers.delete(viewer);
        viewers.delete(viewer);
      },
    });
    entry.viewers.add(viewer);
    viewers.add(viewer);
    this.snapshot(entry, viewer);
    // Behind the snapshot. A shell exiting meanwhile tells every viewer itself, this one included.
    entry.screen.flush(() => {
      if (entry.viewers.has(viewer) && entry.exitNotified) viewer.exit(entry.terminal.exitCode!);
    });
  }

  public hold(owner: object): void {
    this.owned.set(owner, new Set());
  }

  public release(owner: object): void {
    const viewers = this.owned.get(owner);
    this.owned.delete(owner);
    for (const [token, grant] of this.grants) if (grant.owner === owner) this.grants.delete(token);
    for (const viewer of viewers ?? []) viewer.close(TERMINAL_CLOSED_CODE);
  }

  public async close(input: TerminalClosePayload): Promise<void> {
    const entry = this.entries.get(input.id);
    if (!entry) return;
    await (await entry.process.catch(() => undefined))?.close();
    this.remove(entry);
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

  private output(entry: Entry, data: Uint8Array): void {
    if (!this.isCurrent(entry)) return;
    entry.screen.write(data, () => {
      for (const viewer of entry.viewers) viewer.output(data);
      if (entry.paused && entry.screen.backlog < SCREEN_BACKLOG / 2) {
        entry.paused = false;
        void entry.process.then(
          (process) => process.resume(),
          () => undefined
        );
      }
    });
    if (!entry.paused && entry.screen.backlog > SCREEN_BACKLOG) {
      entry.paused = true;
      void entry.process.then(
        (process) => process.pause(),
        () => undefined
      );
    }
  }

  // Flushed first, so viewers draw the exit notice below the shell's last output.
  private exited(entry: Entry, exitCode: number): void {
    if (!this.isCurrent(entry)) return;
    entry.terminal = {...entry.terminal, exitCode};
    this.publishList();
    entry.screen.flush(() => {
      entry.exitNotified = true;
      for (const viewer of entry.viewers) viewer.exit(exitCode);
    });
  }

  private snapshot(entry: Entry, viewer: TerminalViewer): void {
    entry.screen.snapshot((screen) => {
      if (entry.viewers.has(viewer)) viewer.reset(entry.cols, entry.rows, screen);
    });
  }

  // A close that waited may find the id reopened; that terminal is another one.
  private remove(entry: Entry): void {
    if (!this.isCurrent(entry)) return;
    this.entries.delete(entry.terminal.id);
    for (const viewer of entry.viewers) viewer.close(TERMINAL_CLOSED_CODE);
    entry.viewers.clear();
    entry.screen.dispose();
    this.publishList();
  }

  private publishList(): void {
    if (!this.published) return;
    this.deps.list.set({terminals: Object.fromEntries([...this.entries].map(([id, entry]) => [id, entry.terminal]))});
  }

  private isCurrent(entry: Entry): boolean {
    return this.entries.get(entry.terminal.id) === entry;
  }

  private entry(id: string): Entry {
    const entry = this.entries.get(id);
    if (!entry) throw new TerminalNotFoundError({message: "Terminal not found."});
    return entry;
  }
}
