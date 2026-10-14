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
  cols: z.number().int().positive(),
  id: z.string(),
  rows: z.number().int().positive(),
});

export const TerminalClosePayload = z.object({
  id: z.string(),
});

export type TerminalOpenPayload = z.infer<typeof TerminalOpenPayload>;
export type TerminalOpenResult = z.infer<typeof TerminalOpenResult>;
export type TerminalWritePayload = z.infer<typeof TerminalWritePayload>;
export type TerminalResizePayload = z.infer<typeof TerminalResizePayload>;
export type TerminalClosePayload = z.infer<typeof TerminalClosePayload>;
