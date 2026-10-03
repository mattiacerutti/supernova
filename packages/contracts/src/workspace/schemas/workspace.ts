import {z} from "zod";
import {struct, TaggedError} from "@supernova/contracts/runtime/schemas";

export const WorkspaceChangeStatus = z.enum(["added", "deleted", "modified", "renamed", "untracked"]);

export const WorkspaceChangeEntry = struct({
  additions: z.number(),
  deletions: z.number(),
  /** Relative to the repository root, POSIX separators. */
  path: z.string(),
  status: WorkspaceChangeStatus,
});

/** The project folder is not inside a Git repository; expected for plain folders. */
export class WorkspaceNotARepositoryError extends TaggedError("WorkspaceNotARepositoryError") {}

/** The path is missing or escapes the project. */
export class WorkspaceFileNotFoundError extends TaggedError("WorkspaceFileNotFoundError") {}

/** The file has binary content and cannot be shown as text. */
export class WorkspaceBinaryFileError extends TaggedError("WorkspaceBinaryFileError") {}

/** The file exceeds the preview size cap. */
export class WorkspaceFileTooLargeError extends TaggedError("WorkspaceFileTooLargeError") {}

export type WorkspaceChangeStatus = z.infer<typeof WorkspaceChangeStatus>;
export type WorkspaceChangeEntry = z.infer<typeof WorkspaceChangeEntry>;
/** Failures shared by every operation that runs Git in the project. */
export type WorkspaceGitError = WorkspaceNotARepositoryError;
/** Failures of operations that also return file contents. */
export type WorkspaceFileError = WorkspaceGitError | WorkspaceFileNotFoundError | WorkspaceBinaryFileError | WorkspaceFileTooLargeError;
