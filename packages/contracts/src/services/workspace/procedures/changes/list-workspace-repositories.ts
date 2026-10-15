import {z} from "zod";

export const WorkspaceRepositoriesListPayload = z.object({
  projectPath: z.string(),
});

/** Root and immediate children only, sorted; `"."` is the project. Mirrors checkpoint discovery. */
export const WorkspaceRepositoriesListResult = z.object({
  repositories: z.array(z.string()),
});

export type WorkspaceRepositoriesListPayload = z.infer<typeof WorkspaceRepositoriesListPayload>;
export type WorkspaceRepositoriesListResult = z.infer<typeof WorkspaceRepositoriesListResult>;
