import type {Readable} from "@earendil-works/chord";
import type {Terminal, TerminalOutput} from "@supernova/contracts/services/workspace/schemas";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import {useSyncExternalStore} from "react";
import {unwrap} from "@/runtime/runtime-result";
import type {RuntimeClient} from "@/runtime/transport/runtime-client";
import {useRuntime} from "@/runtime/use-runtime";

export interface AttachTerminalInput {
  readonly cols: number;
  /** Where a new shell starts: the session's worktree or project. */
  readonly cwd: string;
  readonly id: string;
  readonly rows: number;
  readonly sessionId: string;
  /** Start the shell first; false for a terminal the server already runs, which then only reattaches. */
  readonly start: boolean;
  readonly onChange: (change: TerminalChange) => void;
  /** Called once the server runs the shell, with its listing; only for a start. */
  readonly onStarted?: (terminal: Terminal) => void;
}

/** What changed in one terminal since the attached client last saw it. */
export type TerminalChange =
  /** Everything kept so far, on attach or when the client fell behind the scrollback cap. */
  | {readonly type: "terminal.history"; readonly data: string}
  | {readonly type: "terminal.output"; readonly data: string}
  | {readonly type: "terminal.exited"; readonly exitCode: number}
  /** The terminal was closed, or no longer exists (another client killed it, the server restarted). Nothing follows. */
  | {readonly type: "terminal.closed"}
  | {readonly type: "terminal.error"; readonly message: string};

/** A tab's connection to one server terminal: send input, claim its size, and detach without ending the shell. */
export interface TerminalSession {
  readonly resize: (cols: number, rows: number) => void;
  readonly write: (data: string) => void;
  readonly detach: () => void;
}

/**
 * Turns one terminal's successive output values into what to draw. Output is the terminal's capped history plus a
 * count of what the cap dropped, so the client knows the absolute position it has drawn up to and appends only what
 * follows; if the cap dropped past it, it redraws from the history.
 */
function follow(onChange: (change: TerminalChange) => void): (output: TerminalOutput | undefined) => void {
  let drawnTo: number | undefined;
  let exited = false;
  let closed = false;
  return (output) => {
    // Nothing until the value arrives; closed is final.
    if (!output || closed) return;
    const end = output.dropped + output.output.length;
    if (drawnTo === undefined || drawnTo < output.dropped) onChange({type: "terminal.history", data: output.output});
    else if (end > drawnTo) onChange({type: "terminal.output", data: output.output.slice(drawnTo - output.dropped)});
    drawnTo = end;
    if (output.exitCode !== undefined && !exited) {
      exited = true;
      onChange({type: "terminal.exited", exitCode: output.exitCode});
    }
    if (output.closed) {
      closed = true;
      onChange({type: "terminal.closed"});
    }
  };
}

const errorMessage = (cause: unknown, fallback: string): string => (cause instanceof Error && cause.message ? cause.message : fallback);

/**
 * Starts or reattaches a terminal, then holds it for as long as the tab shows it: only a held, subscribed terminal's
 * output reaches this client. Attaching claims the shell's size; whoever resizes last sets it.
 */
function attachTerminal(runtime: RuntimeClient, input: AttachTerminalInput): TerminalSession {
  const {id, onChange} = input;
  let detached = false;
  let size = {cols: input.cols, rows: input.rows};
  let hold: ReturnType<RuntimeClient["holdTerminal"]> | undefined;
  const cleanups: Array<() => void> = [];
  const emit = (change: TerminalChange): void => {
    if (!detached) onChange(change);
  };

  const holdOutput = (): void => {
    const held = runtime.holdTerminal(id);
    hold = held;
    cleanups.push(held.onGone(() => emit({type: "terminal.closed"})));
    held.ready.then(
      () => {
        if (detached) return;
        cleanups.push(held.service.output.subscribe(follow(emit)));
        void held.service.resize(size).catch(() => undefined);
      },
      // An unknown terminal fails the hold: closed while this client was away.
      () => emit({type: "terminal.closed"})
    );
  };

  if (input.start) {
    void unwrap(runtime.workspace.openTerminal({cols: input.cols, cwd: input.cwd, id, rows: input.rows, sessionId: input.sessionId})).then(
      (terminal) => {
        if (detached) return;
        input.onStarted?.(terminal);
        holdOutput();
      },
      (cause: unknown) => emit({type: "terminal.error", message: errorMessage(cause, "Failed to start the terminal.")})
    );
  } else {
    holdOutput();
  }

  return {
    detach: () => {
      detached = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
      hold?.release();
    },
    resize: (cols, rows) => {
      size = {cols, rows};
      void hold?.service.resize({cols, rows}).catch(() => undefined);
    },
    write: (data) => void hold?.service.write({data}).catch(() => undefined),
  };
}

/** Attaches to a server terminal. Call the returned function from a mount effect and `detach` on cleanup. */
export function useAttachTerminal(): (input: AttachTerminalInput) => TerminalSession {
  const runtime = useRuntime();
  return (input) => attachTerminal(runtime, input);
}

/** Kills a terminal by id; closing an unknown one is not an error. */
export function useCloseTerminal(): (id: string) => void {
  const runtime = useRuntime();
  return (id) => void runtime.workspace.closeTerminal({id}).catch(() => undefined);
}

/** One subscribe function per readable, so `useSyncExternalStore` keeps its subscription across renders. */
const subscribers = new WeakMap<Readable<unknown>, (onChange: () => void) => () => void>();
function subscriberOf(readable: Readable<unknown>): (onChange: () => void) => () => void {
  let subscribe = subscribers.get(readable);
  if (!subscribe) {
    subscribe = (onChange) => readable.subscribe(onChange);
    subscribers.set(readable, subscribe);
  }
  return subscribe;
}

/**
 * The server's terminals, without output, for as long as the calling component is mounted: the list reaches this
 * client only while something subscribes. `undefined` until it arrives.
 */
export function useServerTerminals(): TerminalsState | undefined {
  const {terminals} = useRuntime().workspace;
  return useSyncExternalStore(subscriberOf(terminals), () => terminals.value);
}
