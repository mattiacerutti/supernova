import {Schema} from "effect";

export const WorkspaceChangeStatus = Schema.Literals(["added", "deleted", "modified", "renamed", "untracked"]);

export const WorkspaceChangeEntry = Schema.Struct({
  additions: Schema.Number,
  deletions: Schema.Number,
  /** Repository-relative path, POSIX separators. */
  path: Schema.String,
  status: WorkspaceChangeStatus,
});

/** Any Git or filesystem failure with no actionable detail. */
export class WorkspaceGenericError extends Schema.TaggedErrorClass<WorkspaceGenericError>()("WorkspaceGenericError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

/** The project folder is not inside a Git repository; expected for plain folders. */
export class WorkspaceNotARepositoryError extends Schema.TaggedErrorClass<WorkspaceNotARepositoryError>()("WorkspaceNotARepositoryError", {
  message: Schema.String,
}) {}

/** The path is missing or escapes the project. */
export class WorkspaceFileNotFoundError extends Schema.TaggedErrorClass<WorkspaceFileNotFoundError>()("WorkspaceFileNotFoundError", {
  message: Schema.String,
}) {}

/** The file has binary content and cannot be shown as text. */
export class WorkspaceBinaryFileError extends Schema.TaggedErrorClass<WorkspaceBinaryFileError>()("WorkspaceBinaryFileError", {
  message: Schema.String,
}) {}

/** The file exceeds the preview size cap. */
export class WorkspaceFileTooLargeError extends Schema.TaggedErrorClass<WorkspaceFileTooLargeError>()("WorkspaceFileTooLargeError", {
  message: Schema.String,
}) {}

/** Failures shared by every operation that runs Git in the project. */
export const WorkspaceGitError = Schema.Union([WorkspaceGenericError, WorkspaceNotARepositoryError]);

/** Failures of operations that also return file contents. */
export const WorkspaceFileError = Schema.Union([
  WorkspaceGenericError,
  WorkspaceNotARepositoryError,
  WorkspaceFileNotFoundError,
  WorkspaceBinaryFileError,
  WorkspaceFileTooLargeError,
]);

export type WorkspaceChangeStatus = typeof WorkspaceChangeStatus.Type;
export type WorkspaceChangeEntry = typeof WorkspaceChangeEntry.Type;
export type WorkspaceGitError = typeof WorkspaceGitError.Type;
export type WorkspaceFileError = typeof WorkspaceFileError.Type;
