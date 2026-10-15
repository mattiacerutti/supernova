import {z} from "zod";

export const WorkspaceBranchesListPayload = z.object({
  projectPath: z.string(),
});

export const WorkspaceBranch = z.object({
  /** Branch name; remote-tracking branches keep their `origin/` prefix. */
  name: z.string(),
  remote: z.boolean(),
  worktreePath: z.string().optional(),
});

export const WorkspaceBranchesListResult = z.object({
  branches: z.array(WorkspaceBranch),
  /** Branch checked out in the project, or undefined on a detached HEAD. */
  current: z.string().optional(),
});

export type WorkspaceBranch = z.infer<typeof WorkspaceBranch>;
export type WorkspaceBranchesListPayload = z.infer<typeof WorkspaceBranchesListPayload>;
export type WorkspaceBranchesListResult = z.infer<typeof WorkspaceBranchesListResult>;
