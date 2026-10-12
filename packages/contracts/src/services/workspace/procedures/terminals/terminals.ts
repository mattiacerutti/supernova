import {z} from "zod";
import {Terminal} from "@supernova/contracts/services/workspace/schemas";

export const TerminalOpenPayload = z.object({
  cols: z.number(),
  /** Where the shell starts; the session's worktree or project. */
  cwd: z.string(),
  /** Client-chosen id, so the tab can exist before the server replies. */
  id: z.string(),
  rows: z.number(),
  sessionId: z.string(),
});
export const TerminalOpenResult = Terminal;

export const TerminalWritePayload = z.object({
  data: z.string(),
  id: z.string(),
});

export const TerminalResizePayload = z.object({
  cols: z.number(),
  id: z.string(),
  rows: z.number(),
});

export const TerminalClosePayload = z.object({
  id: z.string(),
});

export const TerminalsListPayload = z.object({
  sessionId: z.string(),
});
export const TerminalsListResult = z.object({
  terminals: z.array(Terminal),
});

export type TerminalOpenPayload = z.infer<typeof TerminalOpenPayload>;
export type TerminalOpenResult = z.infer<typeof TerminalOpenResult>;
export type TerminalWritePayload = z.infer<typeof TerminalWritePayload>;
export type TerminalResizePayload = z.infer<typeof TerminalResizePayload>;
export type TerminalClosePayload = z.infer<typeof TerminalClosePayload>;
export type TerminalsListPayload = z.infer<typeof TerminalsListPayload>;
export type TerminalsListResult = z.infer<typeof TerminalsListResult>;
