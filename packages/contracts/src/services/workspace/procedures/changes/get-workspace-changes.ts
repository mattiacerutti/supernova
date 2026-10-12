import {z} from "zod";
import {WorkspaceChangeEntry} from "@supernova/contracts/services/workspace/schemas";

export const WorkspaceChangesGetPayload = z.object({
  projectPath: z.string(),
  /** One of the roots from `listWorkspaceRepositories`. */
  repositoryRoot: z.string(),
});

export const WorkspaceChangesGetResult = z.object({
  uncommitted: z.array(WorkspaceChangeEntry),
});

export type WorkspaceChangesGetPayload = z.infer<typeof WorkspaceChangesGetPayload>;
export type WorkspaceChangesGetResult = z.infer<typeof WorkspaceChangesGetResult>;
