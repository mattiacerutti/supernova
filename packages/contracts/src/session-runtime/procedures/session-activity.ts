import {Schema} from "effect";

/** A step of new-session setup long enough to show progress for. */
export const SessionSetupStep = Schema.Literals(["worktree"]);

/** What a session is doing, derived from its `pi.live`. */
export const SessionActivity = Schema.Literals(["idle", "running", "compacting"]);

export type SessionActivity = typeof SessionActivity.Type;
export type SessionSetupStep = typeof SessionSetupStep.Type;
