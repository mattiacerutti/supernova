import {z} from "zod";
import {TaggedError} from "@supernova/contracts/lib/errors";

export const Terminal = z.object({
  cwd: z.string(),
  exitCode: z.number().optional(),
  id: z.string(),
  /** Smallest number unused by the session's other terminals when it started, for labels ("Terminal 2"). */
  number: z.number(),
  sessionId: z.string(),
  startedAt: z.string(),
});

export const TerminalOutput = z.object({
  output: z.string(),
  /** How many characters the cap has dropped from the front so far; a client that drew past them only appends. */
  dropped: z.number(),
  exitCode: z.number().optional(),
  closed: z.boolean().optional(),
});

export class TerminalError extends TaggedError("TerminalError") {}

export class TerminalNotFoundError extends TaggedError("TerminalNotFoundError") {}

export type Terminal = z.infer<typeof Terminal>;
export type TerminalOutput = z.infer<typeof TerminalOutput>;
