import {z} from "zod";
import {array, struct} from "@supernova/contracts/runtime/schemas";

export const WorkspaceRepositoriesListPayload = struct({
  projectPath: z.string(),
});

/**
 * Project-relative roots of the Git worktrees found at the project root and its immediate children,
 * sorted; `"."` is the project itself. Mirrors checkpoint discovery, so deeper repositories are not listed.
 */
export const WorkspaceRepositoriesListResult = struct({
  repositories: array(z.string()),
});

export type WorkspaceRepositoriesListPayload = z.infer<typeof WorkspaceRepositoriesListPayload>;
export type WorkspaceRepositoriesListResult = z.infer<typeof WorkspaceRepositoriesListResult>;
