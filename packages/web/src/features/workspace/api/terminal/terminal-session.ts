import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {TerminalOutput} from "@supernova/contracts/services/workspace/schemas";
import {unwrap} from "@/rpc/runtime-result";
import type {RuntimeClient} from "@/rpc/transport/runtime-client";
import {useRuntime} from "@/rpc/use-runtime";

export interface OpenTerminalInput {
  readonly cols: number;
  readonly cwd: string;
  readonly id: string;
  readonly rows: number;
  readonly sessionId: string;
}

/** What changed in one terminal since the attached client last saw it. */
export type TerminalChange =
  /** Everything kept so far, on attach or when the client fell behind the scrollback cap. */
  | {readonly type: "terminal.history"; readonly data: string}
  | {readonly type: "terminal.output"; readonly data: string}
  | {readonly type: "terminal.exited"; readonly exitCode: number}
  /** The terminal was closed and no longer exists. */
  | {readonly type: "terminal.closed"};

/** A connection to one server terminal: open or reattach, follow its output, send input, resize, close. */
export interface TerminalSession {
  readonly close: () => void;
  readonly resize: (cols: number, rows: number) => void;
  readonly write: (data: string) => void;
  /** Stops following output without ending the shell. */
  readonly detach: () => void;
}

interface AttachTerminalInput extends OpenTerminalInput {
  readonly onError: (message: string) => void;
  readonly onEvent: (event: TerminalChange) => void;
}

/**
 * Turns one terminal's successive replicated values into what to draw. Output is the terminal's capped history plus
 * a count of what the cap dropped, so the client knows the absolute position it has drawn up to and appends only what
 * follows; if the cap dropped past it, it redraws from the history.
 */
function follow(onEvent: (event: TerminalChange) => void): (entry: TerminalOutput | undefined) => void {
  let drawnTo: number | undefined;
  let exited = false;
  let closed = false;
  return (entry) => {
    if (!entry) {
      if (drawnTo !== undefined && !closed) {
        closed = true;
        onEvent({type: "terminal.closed"});
      }
      return;
    }
    const end = entry.dropped + entry.output.length;
    if (drawnTo === undefined || drawnTo < entry.dropped) onEvent({type: "terminal.history", data: entry.output});
    else if (end > drawnTo) onEvent({type: "terminal.output", data: entry.output.slice(drawnTo - entry.dropped)});
    drawnTo = end;
    if (entry.terminal.exitCode !== undefined && !exited) {
      exited = true;
      onEvent({type: "terminal.exited", exitCode: entry.terminal.exitCode});
    }
  };
}

function attachTerminal(runtime: RuntimeClient, input: AttachTerminalInput): TerminalSession {
  const {id, onError, onEvent} = input;
  let detached = false;
  let stop: (() => void) | undefined;
  const report = (cause: unknown, fallback: string) => {
    if (!detached) onError(cause instanceof Error && cause.message ? cause.message : fallback);
  };

  void unwrap(runtime.workspace.openTerminal({cols: input.cols, cwd: input.cwd, id, rows: input.rows, sessionId: input.sessionId}, BACKGROUND_CONTEXT)).then(
    () => {
      if (detached) return;
      const apply = follow((event) => !detached && onEvent(event));
      stop = runtime.workspace.terminals.subscribe((state) => apply(state.terminals[id]));
    },
    (cause: unknown) => report(cause, "Failed to start the terminal.")
  );

  return {
    close: () => void runtime.workspace.closeTerminal({id}, BACKGROUND_CONTEXT).catch(() => undefined),
    detach: () => {
      detached = true;
      stop?.();
    },
    resize: (cols, rows) => void runtime.workspace.resizeTerminal({cols, id, rows}, BACKGROUND_CONTEXT).catch(() => undefined),
    write: (data) => void runtime.workspace.writeTerminal({data, id}, BACKGROUND_CONTEXT).catch(() => undefined),
  };
}

/** Attaches to a server terminal. Call the returned function from a mount effect and `detach` on cleanup. */
export function useAttachTerminal(): (input: AttachTerminalInput) => TerminalSession {
  const runtime = useRuntime();
  return (input) => attachTerminal(runtime, input);
}

/** Ids of the shells the server still runs for a session; a reloaded client reattaches tabs to them. */
export function useListTerminalIds(): (sessionId: string) => Promise<readonly string[]> {
  const runtime = useRuntime();
  return async (sessionId) => (await unwrap(runtime.workspace.listTerminals({sessionId}, BACKGROUND_CONTEXT))).terminals.map((terminal) => terminal.id);
}

/** Kills a terminal by id; for closing a tab, where no component is attached anymore. */
export function useCloseTerminal(): (id: string) => void {
  const runtime = useRuntime();
  return (id) => void runtime.workspace.closeTerminal({id}, BACKGROUND_CONTEXT).catch(() => undefined);
}
