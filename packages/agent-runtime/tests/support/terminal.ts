import xtermHeadless from "@xterm/headless";
import type {TerminalChannelEvent} from "@supernova/contracts/services/workspace/schemas";
import type {TerminalSocket} from "@supernova/agent-runtime/features/workspace/natives/terminal/terminal-viewer";

// These tests consume raw PTY output, without a terminal emulator for PowerShell's interactive line editor.
export const testShell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";

export function shellCommand(posix: string, windows: string): string {
  return process.platform === "win32" ? `${windows}\r` : `${posix}\n`;
}

const encoder = new TextEncoder();

export interface TestViewerOptions {
  /** Off, the viewer stops acknowledging, as a client that stopped reading. */
  readonly acknowledge?: boolean;
}

/** Draws into a headless xterm, as the browser does, so a test reads the screen a person would see. */
export class TestViewer {
  public readonly socket: TerminalSocket;
  public readonly terminal = new xtermHeadless.Terminal({allowProposedApi: true, cols: 80, rows: 24, scrollback: 5_000});
  public readonly events: TerminalChannelEvent[] = [];
  /** Every frame in arrival order: events, and output as text. */
  public readonly frames: (TerminalChannelEvent | string)[] = [];
  public closedWith: number | undefined;
  public total = 0;
  public acknowledge: boolean;
  private messageListener: ((data: Uint8Array | string) => void) | undefined;
  private closeListener: (() => void) | undefined;
  private unacked = 0;
  private pending = 0;

  public constructor(options: TestViewerOptions = {}) {
    this.acknowledge = options.acknowledge ?? true;
    this.socket = {
      bufferedAmount: 0,
      send: (data) => this.deliver(data),
      close: (code) => {
        if (this.closedWith !== undefined) return;
        this.closedWith = code;
        this.closeListener?.();
      },
      onMessage: (listener) => {
        this.messageListener = listener;
      },
      onClose: (listener) => {
        this.closeListener = listener;
      },
    };
  }

  public get resets(): number {
    return this.events.filter((event) => event.type === "reset").length;
  }

  public type(text: string): void {
    this.messageListener?.(encoder.encode(text));
  }

  public sendText(text: string): void {
    this.messageListener?.(text);
  }

  public catchUp(): void {
    this.flushAck(true);
  }

  public disconnect(): void {
    this.socket.close(1000);
  }

  public async screen(): Promise<string[]> {
    await this.drawn();
    const buffer = this.terminal.buffer.active;
    return Array.from({length: this.terminal.rows}, (_, row) => buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "");
  }

  /** Wrapped rows joined, so text a program wrote as one line matches as one. */
  public async text(): Promise<string> {
    await this.drawn();
    const buffer = this.terminal.buffer.active;
    let text = "";
    for (let row = 0; row < buffer.length; row++) {
      const line = buffer.getLine(row);
      if (!line) continue;
      text += `${row > 0 && !line.isWrapped ? "\n" : ""}${line.translateToString(true)}`;
    }
    return text;
  }

  public drawn(): Promise<void> {
    return new Promise((resolve) => this.terminal.write("", resolve));
  }

  private deliver(data: Uint8Array | string): void {
    if (this.closedWith !== undefined) return;
    if (typeof data === "string") {
      const event = JSON.parse(data) as TerminalChannelEvent;
      this.events.push(event);
      this.frames.push(event);
      // In the write queue, as the browser does: output still queued must not draw over the snapshot.
      if (event.type === "reset")
        this.terminal.write("", () => {
          this.terminal.reset();
          this.terminal.resize(event.cols, event.rows);
        });
      return;
    }
    this.frames.push(new TextDecoder().decode(data));
    this.total += data.length;
    this.pending += data.length;
    this.terminal.write(data, () => {
      this.pending -= data.length;
      this.unacked += data.length;
      this.flushAck(false);
    });
  }

  private flushAck(force: boolean): void {
    if (!this.acknowledge || this.unacked === 0 || (!force && this.unacked < 64 * 1024 && this.pending > 0)) return;
    const bytes = this.unacked;
    this.unacked = 0;
    this.messageListener?.(JSON.stringify({type: "ack", bytes}));
  }
}
