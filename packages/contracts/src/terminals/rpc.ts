import {Schema} from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  TerminalClosePayload,
  TerminalOpenPayload,
  TerminalOpenResult,
  TerminalResizePayload,
  TerminalsListPayload,
  TerminalsListResult,
  TerminalWatchPayload,
  TerminalWatchResult,
  TerminalWritePayload,
} from "@supernova/contracts/terminals/procedures";
import {TerminalError, TerminalNotFoundError} from "@supernova/contracts/terminals/schemas";

const TerminalCommandError = Schema.Union([TerminalError, TerminalNotFoundError]);

export const TerminalOpenRpc = Rpc.make("openTerminal", {error: TerminalError, payload: TerminalOpenPayload, success: TerminalOpenResult});
export const TerminalWriteRpc = Rpc.make("writeTerminal", {error: TerminalCommandError, payload: TerminalWritePayload, success: Schema.Void});
export const TerminalResizeRpc = Rpc.make("resizeTerminal", {error: TerminalCommandError, payload: TerminalResizePayload, success: Schema.Void});
export const TerminalCloseRpc = Rpc.make("closeTerminal", {error: TerminalError, payload: TerminalClosePayload, success: Schema.Void});
export const TerminalsListRpc = Rpc.make("listTerminals", {error: TerminalError, payload: TerminalsListPayload, success: TerminalsListResult});
export const TerminalWatchRpc = Rpc.make("watchTerminal", {error: TerminalCommandError, payload: TerminalWatchPayload, stream: true, success: TerminalWatchResult});

export const TerminalRpcs = [TerminalOpenRpc, TerminalWriteRpc, TerminalResizeRpc, TerminalCloseRpc, TerminalsListRpc, TerminalWatchRpc] as const;
