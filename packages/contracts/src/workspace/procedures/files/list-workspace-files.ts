import {Schema} from "effect";

export const WorkspaceFilesListPayload = Schema.Struct({
  projectPath: Schema.String,
});

/** Tracked and untracked-but-not-ignored files of every discovered repository, project-relative with POSIX separators. */
export const WorkspaceFilesListResult = Schema.Struct({
  files: Schema.Array(Schema.String),
});

export type WorkspaceFilesListPayload = typeof WorkspaceFilesListPayload.Type;
export type WorkspaceFilesListResult = typeof WorkspaceFilesListResult.Type;
