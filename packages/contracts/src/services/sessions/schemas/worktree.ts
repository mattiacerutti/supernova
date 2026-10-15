import {z} from "zod";

export const SessionWorktree = z.object({
  branch: z.string(),
  path: z.string(),
});

export const SessionWorkspaceSelection = z.union([z.object({mode: z.literal("local")}), z.object({mode: z.literal("worktree"), baseRef: z.string()})]);

export type SessionWorktree = z.infer<typeof SessionWorktree>;
export type SessionWorkspaceSelection = z.infer<typeof SessionWorkspaceSelection>;
