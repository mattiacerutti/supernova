import {Schema} from "effect";
import {Terminal, TerminalEvent} from "../schemas";

export const TerminalOpenPayload = Schema.Struct({
  cols: Schema.Number,
  /** Where the shell starts; the session's worktree or project. */
  cwd: Schema.String,
  /** Client-chosen id, so the tab can exist before the server replies. */
  id: Schema.String,
  rows: Schema.Number,
  sessionId: Schema.String,
});
export const TerminalOpenResult = Terminal;

export const TerminalWritePayload = Schema.Struct({
  data: Schema.String,
  id: Schema.String,
});

export const TerminalResizePayload = Schema.Struct({
  cols: Schema.Number,
  id: Schema.String,
  rows: Schema.Number,
});

export const TerminalClosePayload = Schema.Struct({
  id: Schema.String,
});

export const TerminalWatchPayload = Schema.Struct({
  id: Schema.String,
});
export const TerminalWatchResult = TerminalEvent;

export const TerminalsListPayload = Schema.Struct({
  sessionId: Schema.String,
});
export const TerminalsListResult = Schema.Struct({
  terminals: Schema.Array(Terminal),
});

export type TerminalOpenPayload = typeof TerminalOpenPayload.Type;
export type TerminalOpenResult = typeof TerminalOpenResult.Type;
export type TerminalWritePayload = typeof TerminalWritePayload.Type;
export type TerminalResizePayload = typeof TerminalResizePayload.Type;
export type TerminalClosePayload = typeof TerminalClosePayload.Type;
export type TerminalWatchPayload = typeof TerminalWatchPayload.Type;
export type TerminalsListPayload = typeof TerminalsListPayload.Type;
export type TerminalsListResult = typeof TerminalsListResult.Type;
