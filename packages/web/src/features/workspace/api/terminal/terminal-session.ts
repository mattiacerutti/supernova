import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useWatch} from "@earendil-works/chord/react";
import type {Terminal, TerminalOutput} from "@supernova/contracts/services/workspace/schemas";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import type {RuntimeClient} from "@/runtime/client";
import {TerminalService} from "@supernova/contracts/services/workspace/services";
import type {OwnerOf} from "@/runtime/references";
import {asOwner, follow as followValue, whenLive} from "@/runtime/references";
import {useRuntime} from "@/runtime/hooks/use-runtime";

interface AttachTerminalInput {
  readonly cols: number;
  readonly cwd: string;
  readonly id: string;
  readonly rows: number;
  readonly sessionId: string;
  readonly start: boolean;
  readonly onChange: (change: TerminalChange) => void;
  readonly onStarted?: (terminal: Terminal) => void;
}

type TerminalChange =
  | {readonly type: "terminal.history"; readonly data: string}
  | {readonly type: "terminal.output"; readonly data: string}
  | {readonly type: "terminal.exited"; readonly exitCode: number}
  | {readonly type: "terminal.closed"}
  | {readonly type: "terminal.error"; readonly message: string};

interface TerminalSession {
  readonly resize: (cols: number, rows: number) => void;
  readonly write: (data: string) => void;
  readonly detach: () => void;
}

function follow(onChange: (change: TerminalChange) => void): (output: TerminalOutput | undefined) => void {
  let drawnTo: number | undefined;
  let exited = false;
  let closed = false;
  return (output) => {
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

function attachTerminal(runtime: RuntimeClient, input: AttachTerminalInput): TerminalSession {
  const {id, onChange} = input;
  let detached = false;
  let size = {cols: input.cols, rows: input.rows};
  let hold: OwnerOf<typeof TerminalService> | undefined;
  const cleanups: Array<() => void> = [];
  const emit = (change: TerminalChange): void => {
    if (!detached) onChange(change);
  };

  const holdOutput = (): void => {
    const held: OwnerOf<typeof TerminalService> = asOwner(runtime.host.hold(TerminalService, {terminalId: id}, context));
    hold = held;
    cleanups.push(followValue(held.state, (state) => state.kind === "ended" && emit({type: "terminal.closed"})));
    whenLive(held).then(
      () => {
        if (detached) return;
        cleanups.push(followValue(held.output, follow(emit)));
        void held.resize(size, context).catch(() => undefined);
      },
      () => emit({type: "terminal.closed"})
    );
  };

  if (input.start) {
    void runtime.workspace.openTerminal({cols: input.cols, cwd: input.cwd, id, rows: input.rows, sessionId: input.sessionId}, context).then(
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
      void hold?.resize({cols, rows}, context).catch(() => undefined);
    },
    write: (data) => void hold?.write({data}, context).catch(() => undefined),
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
