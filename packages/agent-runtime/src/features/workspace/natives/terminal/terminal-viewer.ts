import type {TerminalChannelAck, TerminalChannelEvent} from "@supernova/contracts/services/workspace/schemas";

/** Bounds how long an echo waits behind earlier output: 0.4 s at 5 Mbit/s. Clients ack every 64 KiB. */
const OUTPUT_WINDOW = 256 * 1024;
/** Its client reconnects to a fresh snapshot, so dropping the socket loses nothing. */
const MAX_BACKLOG = 8 * 1024 * 1024;
const UNSUPPORTED_DATA = 1003;
const TRY_AGAIN_LATER = 1013;

const encoder = new TextEncoder();

export interface TerminalSocket {
  readonly bufferedAmount: number;
  send(data: Uint8Array | string): void;
  close(code: number): void;
  onMessage(listener: (data: Uint8Array | string) => void): void;
  onClose(listener: () => void): void;
}

export interface TerminalViewerEvents {
  readonly input: (bytes: Uint8Array) => void;
  readonly catchUp: () => void;
  readonly closed: () => void;
}

/**
 * Past the window a viewer gets nothing until its acks catch up, then a fresh snapshot. A snapshot never counts against
 * the window, or a large one would trigger itself forever.
 */
export class TerminalViewer {
  private readonly socket: TerminalSocket;
  private sent = 0;
  private acked = 0;
  private snapshotEnd = 0;
  /** Until its first snapshot, a viewer has nothing output could continue. */
  private behind = true;
  private awaitingSnapshot = true;

  public constructor(socket: TerminalSocket, events: TerminalViewerEvents) {
    this.socket = socket;
    socket.onMessage((data) => {
      if (typeof data !== "string") events.input(data);
      else if (!this.acknowledge(data)) socket.close(UNSUPPORTED_DATA);
      else if (this.behind && !this.awaitingSnapshot && this.lag() <= OUTPUT_WINDOW / 4) {
        this.awaitingSnapshot = true;
        events.catchUp();
      }
    });
    socket.onClose(events.closed);
  }

  public reset(cols: number, rows: number, screen: string): void {
    this.event({type: "reset", cols, rows});
    const bytes = encoder.encode(screen);
    this.send(bytes);
    this.sent += bytes.length;
    this.snapshotEnd = this.sent;
    this.behind = false;
    this.awaitingSnapshot = false;
  }

  public output(bytes: Uint8Array): void {
    if (this.behind) return;
    // Past the window only when nothing is in flight: an empty window would otherwise wait for acks that cannot come.
    if (this.lag() > 0 && this.lag() + bytes.length > OUTPUT_WINDOW) {
      this.behind = true;
      return;
    }
    this.send(bytes);
    this.sent += bytes.length;
  }

  public exit(exitCode: number): void {
    this.event({type: "exit", exitCode});
  }

  public close(code: number): void {
    this.socket.close(code);
  }

  private lag(): number {
    return this.sent - Math.max(this.acked, this.snapshotEnd);
  }

  private acknowledge(text: string): boolean {
    let ack: Partial<TerminalChannelAck> | null;
    try {
      ack = JSON.parse(text) as Partial<TerminalChannelAck> | null;
    } catch {
      return false;
    }
    if (typeof ack !== "object" || ack === null || ack.type !== "ack" || !Number.isSafeInteger(ack.bytes) || ack.bytes! <= 0) return false;
    this.acked = Math.min(this.sent, this.acked + ack.bytes!);
    return true;
  }

  private event(event: TerminalChannelEvent): void {
    this.send(JSON.stringify(event));
  }

  private send(data: Uint8Array | string): void {
    if (this.socket.bufferedAmount > MAX_BACKLOG) this.socket.close(TRY_AGAIN_LATER);
    else this.socket.send(data);
  }
}
