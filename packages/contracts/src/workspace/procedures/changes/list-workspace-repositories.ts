import {Schema} from "effect";

export const WorkspaceRepositoriesListPayload = Schema.Struct({
  projectPath: Schema.String,
});

/**
 * Project-relative roots of the Git worktrees found at the project root and its immediate children,
 * sorted; `"."` is the project itself. Mirrors checkpoint discovery, so deeper repositories are not listed.
 */
export const WorkspaceRepositoriesListResult = Schema.Struct({
  repositories: Schema.Array(Schema.String),
});

export type WorkspaceRepositoriesListPayload = typeof WorkspaceRepositoriesListPayload.Type;
export type WorkspaceRepositoriesListResult = typeof WorkspaceRepositoriesListResult.Type;
