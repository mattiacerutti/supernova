import {z} from "zod";

/** A step of new-session setup long enough to show progress for. */
export const SessionSetupStep = z.enum(["worktree"]);

/** What a session is doing, derived from its `pi.live`. */
export const SessionActivity = z.enum(["idle", "running", "compacting"]);

/**
 * A problem that did not fail a command, reported to the session's clients: an input that ended unanswered, a failed
 * compaction (`error`), or an extension that could not do something here (`warning`, with its path).
 */
export const SessionNotice = z.object({
  id: z.string(),
  level: z.enum(["warning", "error"]),
  message: z.string(),
  at: z.string(),
  extensionPath: z.string().optional(),
  extensionName: z.string().optional(),
});

export type SessionNotice = z.infer<typeof SessionNotice>;
export type SessionActivity = z.infer<typeof SessionActivity>;
export type SessionSetupStep = z.infer<typeof SessionSetupStep>;
