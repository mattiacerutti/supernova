import type {Context, ReplicatedState} from "@earendil-works/chord";
import {defineService} from "@earendil-works/chord";
import type {ServiceResult} from "@supernova/contracts/runtime/services";
import type {
  TerminalClosePayload,
  TerminalOpenPayload,
  TerminalOpenResult,
  TerminalResizePayload,
  TerminalsListPayload,
  TerminalsListResult,
  TerminalWritePayload,
} from "@supernova/contracts/terminals/procedures";
import type {TerminalError, TerminalNotFoundError, TerminalOutput} from "@supernova/contracts/terminals/schemas";

export interface TerminalsState {
  /** Every running or exited shell, keyed by terminal id; a closed one leaves. */
  readonly terminals: Readonly<Record<string, TerminalOutput>>;
}

/**
 * Shells the server runs for sessions. Their output is replicated state: new output reaches clients as string appends,
 * and the capped scrollback drops from the front.
 */
export interface TerminalsService {
  readonly state: ReplicatedState<TerminalsState>;
  /** Starts a shell, or returns the existing terminal with that id so a reopened tab reattaches. */
  open(payload: TerminalOpenPayload, context: Context): Promise<ServiceResult<TerminalOpenResult, TerminalError>>;
  write(payload: TerminalWritePayload, context: Context): Promise<ServiceResult<null, TerminalNotFoundError>>;
  resize(payload: TerminalResizePayload, context: Context): Promise<ServiceResult<null, TerminalNotFoundError>>;
  /** Kills the shell; closing an unknown terminal is not an error. */
  close(payload: TerminalClosePayload, context: Context): Promise<ServiceResult<null>>;
  list(payload: TerminalsListPayload, context: Context): Promise<ServiceResult<TerminalsListResult>>;
}

export const TerminalsService = defineService<TerminalsService>("supernova.terminals");
