import {z} from "zod";
import {array, struct} from "@supernova/contracts/runtime/schemas";
import {Terminal} from "../schemas";

export const TerminalOpenPayload = struct({
  cols: z.number(),
  /** Where the shell starts; the session's worktree or project. */
  cwd: z.string(),
  /** Client-chosen id, so the tab can exist before the server replies. */
  id: z.string(),
  rows: z.number(),
  sessionId: z.string(),
});
export const TerminalOpenResult = Terminal;

export const TerminalWritePayload = struct({
  data: z.string(),
  id: z.string(),
});

export const TerminalResizePayload = struct({
  cols: z.number(),
  id: z.string(),
  rows: z.number(),
});

export const TerminalClosePayload = struct({
  id: z.string(),
});

export const TerminalsListPayload = struct({
  sessionId: z.string(),
});
export const TerminalsListResult = struct({
  terminals: array(Terminal),
});

export type TerminalOpenPayload = z.infer<typeof TerminalOpenPayload>;
export type TerminalOpenResult = z.infer<typeof TerminalOpenResult>;
export type TerminalWritePayload = z.infer<typeof TerminalWritePayload>;
export type TerminalResizePayload = z.infer<typeof TerminalResizePayload>;
export type TerminalClosePayload = z.infer<typeof TerminalClosePayload>;
export type TerminalsListPayload = z.infer<typeof TerminalsListPayload>;
export type TerminalsListResult = z.infer<typeof TerminalsListResult>;
