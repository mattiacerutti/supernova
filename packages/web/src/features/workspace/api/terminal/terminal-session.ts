import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {failureOf} from "@supernova/contracts/lib/errors";
import {useWatch} from "@earendil-works/chord/react";
import type {Terminal, TerminalChannelAck, TerminalChannelEvent} from "@supernova/contracts/services/workspace/schemas";
import {TERMINAL_CLOSED_CODE} from "@supernova/contracts/services/workspace/schemas";
import type {TerminalThemePayload} from "@supernova/contracts/services/workspace/procedures";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import {TerminalErrors, TerminalService} from "@supernova/contracts/services/workspace/services";
import type {RuntimeClient} from "@/runtime/client";
import type {OwnerOf} from "@/runtime/references";
import {asOwner, follow, whenLive} from "@/runtime/references";
import {useRuntime} from "@/runtime/hooks/use-runtime";

/** A quarter of the server's window, so output keeps flowing while acks travel. */
const ACK_BATCH_BYTES = 64 * 1024;
/** So a trickle below a batch is still acknowledged. */
const ACK_DELAY_MS = 50;
/** Typing while the channel connects is sent once it opens; past this, a long outage drops it instead. */
const MAX_PENDING_INPUT_BYTES = 64 * 1024;
/** Below the server's 1 MiB message limit. */
const MAX_INPUT_FRAME_BYTES = 256 * 1024;
const RECONNECT_MIN_MS = 250;
const RECONNECT_MAX_MS = 5_000;

const encoder = new TextEncoder();

/** Callbacks run once the bytes are drawn: acks count drawn bytes. */
export interface TerminalDisplay {
  /** Replaces the screen with `screen`, drawn at the size it was taken, after output written before it. */
  readonly reset: (cols: number, rows: number, screen: Uint8Array, drawn: () => void) => void;
  readonly write: (data: Uint8Array, drawn: () => void) => void;
}

interface AttachTerminalInput {
  readonly cols: number;
  readonly cwd: string;
  readonly display: TerminalDisplay;
  readonly id: string;
  readonly rows: number;
  readonly sessionId: string;
  readonly start: boolean;
  readonly theme: TerminalThemePayload;
  readonly onChange: (change: TerminalChange) => void;
  readonly onStarted?: (terminal: Terminal) => void;
}

type TerminalChange =
  | {readonly type: "terminal.exited"; readonly exitCode: number}
  | {readonly type: "terminal.closed"}
  | {readonly type: "terminal.error"; readonly message: string};

interface TerminalSession {
  readonly resize: (cols: number, rows: number) => void;
  readonly setTheme: (theme: TerminalThemePayload) => void;
  readonly write: (data: string) => void;
  readonly detach: () => void;
}

const errorMessage = (cause: unknown, fallback: string): string => (cause instanceof Error && cause.message ? cause.message : fallback);

/**
 * Control is the held `TerminalService`; bytes go over a socket it admits. A dropped socket reconnects while the hold is
 * live; the hold's end or the terminal closing ends it for good.
 */
function attachTerminal(runtime: RuntimeClient, input: AttachTerminalInput): TerminalSession {
  const {id, display, onChange} = input;
  let detached = false;
  let closed = false;
  let exited = false;
  let size = {cols: input.cols, rows: input.rows};
  let theme = input.theme;
  let hold: OwnerOf<typeof TerminalService> | undefined;
  let socket: WebSocket | undefined;
  let reconnectDelay = RECONNECT_MIN_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const pendingInput: Uint8Array<ArrayBuffer>[] = [];
  let pendingBytes = 0;
  let unacked = 0;
  let ackTimer: ReturnType<typeof setTimeout> | undefined;
  const cleanups: Array<() => void> = [];
  const emit = (change: TerminalChange): void => {
    if (!detached) onChange(change);
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    clearTimeout(reconnectTimer);
    socket?.close();
    emit({type: "terminal.closed"});
  };

  const flushAck = (current: WebSocket): void => {
    clearTimeout(ackTimer);
    ackTimer = undefined;
    if (unacked === 0 || current !== socket || current.readyState !== WebSocket.OPEN) return;
    current.send(JSON.stringify({type: "ack", bytes: unacked} satisfies TerminalChannelAck));
    unacked = 0;
  };
  // A socket replaced meanwhile drew bytes the new one's viewer never sent.
  const acknowledge = (current: WebSocket, bytes: number): void => {
    if (current !== socket) return;
    unacked += bytes;
    if (unacked >= ACK_BATCH_BYTES) flushAck(current);
    else ackTimer ??= setTimeout(() => flushAck(current), ACK_DELAY_MS);
  };

  /** Set by `reset`: the next binary frame is that snapshot. */
  let resetTo: {readonly cols: number; readonly rows: number} | undefined;
  const event = (frame: TerminalChannelEvent): void => {
    if (frame.type === "reset") {
      resetTo = {cols: frame.cols, rows: frame.rows};
    } else if (!exited) {
      exited = true;
      emit({type: "terminal.exited", exitCode: frame.exitCode});
    }
  };

  const reconnect = (): void => {
    if (detached || closed) return;
    reconnectTimer = setTimeout(openChannel, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  };

  const openChannel = (): void => {
    const held = hold;
    if (detached || closed || !held) return;
    void (async () => {
      await whenLive(held);
      const {token} = await held.channel(context);
      if (detached || closed) return;
      const current = new WebSocket(runtime.terminalSocketUrl(token));
      current.binaryType = "arraybuffer";
      socket = current;
      unacked = 0;
      clearTimeout(ackTimer);
      ackTimer = undefined;
      resetTo = undefined;
      current.onopen = () => {
        reconnectDelay = RECONNECT_MIN_MS;
        for (const bytes of pendingInput.splice(0)) current.send(bytes);
        pendingBytes = 0;
      };
      current.onmessage = (message: MessageEvent<ArrayBuffer | string>) => {
        if (current !== socket) return;
        if (typeof message.data === "string") event(JSON.parse(message.data) as TerminalChannelEvent);
        else {
          const bytes = new Uint8Array(message.data);
          const drawn = () => acknowledge(current, bytes.length);
          if (!resetTo) return display.write(bytes, drawn);
          display.reset(resetTo.cols, resetTo.rows, bytes, drawn);
          resetTo = undefined;
        }
      };
      current.onclose = (closeEvent) => {
        if (current !== socket) return;
        socket = undefined;
        if (closeEvent.code === TERMINAL_CLOSED_CODE) close();
        else reconnect();
      };
    })().catch((cause: unknown) => {
      // The terminal is gone; any other failure is the connection's, and the hold's own end stops the retries.
      if (failureOf(cause, TerminalErrors.channel) === "TerminalNotFoundError") close();
      else reconnect();
    });
  };

  const holdTerminal = (): void => {
    const held: OwnerOf<typeof TerminalService> = asOwner(runtime.host.hold(TerminalService, {terminalId: id}, context));
    hold = held;
    cleanups.push(follow(held.state, (state) => state.kind === "ended" && close()));
    whenLive(held).then(
      () => {
        if (detached) return;
        void held.resize(size, context).catch(() => undefined);
        void held.theme(theme, context).catch(() => undefined);
        openChannel();
      },
      () => close()
    );
  };

  if (input.start) {
    void runtime.workspace.openTerminal({cols: input.cols, cwd: input.cwd, id, rows: input.rows, sessionId: input.sessionId}, context).then(
      (terminal) => {
        if (detached) return;
        input.onStarted?.(terminal);
        holdTerminal();
      },
      (cause: unknown) => emit({type: "terminal.error", message: errorMessage(cause, "Failed to start the terminal.")})
    );
  } else {
    holdTerminal();
  }

  return {
    detach: () => {
      detached = true;
      clearTimeout(reconnectTimer);
      clearTimeout(ackTimer);
      for (const cleanup of cleanups.splice(0)) cleanup();
      socket?.close();
      socket = undefined;
      hold?.release();
    },
    resize: (cols, rows) => {
      size = {cols, rows};
      void hold?.resize({cols, rows}, context).catch(() => undefined);
    },
    setTheme: (next) => {
      theme = next;
      void hold?.theme(next, context).catch(() => undefined);
    },
    write: (data) => {
      const bytes = encoder.encode(data);
      if (socket?.readyState !== WebSocket.OPEN) {
        // Whole or not at all: the shell must never get the end of a paste without its start.
        if (closed || pendingBytes + bytes.length > MAX_PENDING_INPUT_BYTES) return;
        pendingInput.push(bytes);
        pendingBytes += bytes.length;
        return;
      }
      // A large paste is split, in order, so no frame passes the server's limit.
      for (let start = 0; start < bytes.length; start += MAX_INPUT_FRAME_BYTES) socket.send(bytes.subarray(start, start + MAX_INPUT_FRAME_BYTES));
    },
  };
}

export function useAttachTerminal(): (input: AttachTerminalInput) => TerminalSession {
  const runtime = useRuntime();
  return (input) => attachTerminal(runtime, input);
}

export function useCloseTerminal(): (id: string) => void {
  const runtime = useRuntime();
  return (id) => void runtime.workspace.closeTerminal({id}, context).catch(() => undefined);
}

export function useServerTerminals(): TerminalsState | undefined {
  return useWatch(useRuntime().workspace.terminals);
}
