import {z} from "zod";
import {TaggedError} from "@supernova/contracts/lib/errors";

/** A shell the server runs for a session, in the session's workspace. */
export const Terminal = z.object({
  /** Working directory the shell started in. */
  cwd: z.string(),
  /** Exit code once the shell has exited; the terminal stays listed until it is closed. */
  exitCode: z.number().optional(),
  id: z.string(),
  /** Smallest number unused by the session's other terminals when it started, for labels ("Terminal 2"). */
  number: z.number(),
  sessionId: z.string(),
  /** ISO timestamp of when the shell started. */
  startedAt: z.string(),
});

/** One terminal's output, as its `TerminalService` object holds it. */
export const TerminalOutput = z.object({
  /** Output since the shell started, capped from the front; new output is appended. */
  output: z.string(),
  /** How many characters the cap has dropped from the front so far; a client that drew past them only appends. */
  dropped: z.number(),
  /** Exit code once the shell has exited. */
  exitCode: z.number().optional(),
  /** Set when the terminal is closed; nothing follows. */
  closed: z.boolean().optional(),
});

export class TerminalError extends TaggedError("TerminalError") {}

export class TerminalNotFoundError extends TaggedError("TerminalNotFoundError") {}

export type Terminal = z.infer<typeof Terminal>;
export type TerminalOutput = z.infer<typeof TerminalOutput>;
