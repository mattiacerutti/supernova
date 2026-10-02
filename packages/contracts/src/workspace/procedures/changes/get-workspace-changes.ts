import {z} from "zod";
import {array, struct} from "@supernova/contracts/runtime/schemas";
import {WorkspaceChangeEntry} from "@supernova/contracts/workspace/schemas";

export const WorkspaceChangesGetPayload = struct({
  projectPath: z.string(),
  /** One of the roots from `listWorkspaceRepositories`. */
  repositoryRoot: z.string(),
});

export const WorkspaceChangesGetResult = struct({
  uncommitted: array(WorkspaceChangeEntry),
});

export type WorkspaceChangesGetPayload = z.infer<typeof WorkspaceChangesGetPayload>;
export type WorkspaceChangesGetResult = z.infer<typeof WorkspaceChangesGetResult>;
