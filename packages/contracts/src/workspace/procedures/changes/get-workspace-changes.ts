import {Schema} from "effect";
import {WorkspaceChangeEntry} from "@supernova/contracts/workspace/schemas";

export const WorkspaceChangesGetPayload = Schema.Struct({
  projectPath: Schema.String,
  /** One of the roots from `listWorkspaceRepositories`. */
  repositoryRoot: Schema.String,
});

export const WorkspaceChangesGetResult = Schema.Struct({
  uncommitted: Schema.Array(WorkspaceChangeEntry),
});

export type WorkspaceChangesGetPayload = typeof WorkspaceChangesGetPayload.Type;
export type WorkspaceChangesGetResult = typeof WorkspaceChangesGetResult.Type;
