import {z} from "zod";

/** A Git worktree a session runs in, separate from the project's own checkout. */
export const SessionWorktree = z.object({
  /** Branch checked out in the worktree. */
  branch: z.string(),
  /** Absolute path of the worktree on the server. */
  path: z.string(),
});

/** Where a new session runs: the project's checkout, or a fresh worktree branched off `baseRef`. */
export const SessionWorkspaceSelection = z.union([z.object({mode: z.literal("local")}), z.object({mode: z.literal("worktree"), baseRef: z.string()})]);

export type SessionWorktree = z.infer<typeof SessionWorktree>;
export type SessionWorkspaceSelection = z.infer<typeof SessionWorkspaceSelection>;
