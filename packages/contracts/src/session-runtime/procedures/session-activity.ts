import {z} from "zod";

/** A step of new-session setup long enough to show progress for. */
export const SessionSetupStep = z.enum(["worktree"]);

/** What a session is doing, derived from its `pi.live`. */
export const SessionActivity = z.enum(["idle", "running", "compacting"]);

export type SessionActivity = z.infer<typeof SessionActivity>;
export type SessionSetupStep = z.infer<typeof SessionSetupStep>;
