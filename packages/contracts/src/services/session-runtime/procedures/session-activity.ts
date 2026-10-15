import {z} from "zod";
import type {LiveState} from "@supernova/contracts/services/sessions/schemas";

export const SessionSetupStep = z.enum(["worktree"]);

export const SessionActivity = z.enum(["idle", "running", "compacting"]);

/**
 * Shared by server (directory) and client (from a held document) so status and content never disagree. A manual
 * compaction runs without a run.
 */
export function sessionActivityOf(live: LiveState): SessionActivity {
  if ((live.compactions ?? []).some((compaction) => compaction.blocking || compaction.reason === "manual")) return "compacting";
  return live.run === undefined ? "idle" : "running";
}

/**
 * A problem that failed no command: an unanswered input or failed compaction (`error`), or something an extension
 * cannot do here (`warning`, with its path).
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
