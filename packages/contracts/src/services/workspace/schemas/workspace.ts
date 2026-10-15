import {z} from "zod";
import type {ErrorOf} from "@supernova/contracts/lib/errors";
import {errorUnion, TaggedError} from "@supernova/contracts/lib/errors";

export const WorkspaceChangeStatus = z.enum(["added", "deleted", "modified", "renamed", "untracked"]);

export const WorkspaceChangeEntry = z.object({
  additions: z.number(),
  deletions: z.number(),
  path: z.string(),
  status: WorkspaceChangeStatus,
});

export class WorkspaceNotARepositoryError extends TaggedError("WorkspaceNotARepositoryError") {}

export class WorkspaceFileNotFoundError extends TaggedError("WorkspaceFileNotFoundError") {}

export class WorkspaceBinaryFileError extends TaggedError("WorkspaceBinaryFileError") {}

export class WorkspaceFileTooLargeError extends TaggedError("WorkspaceFileTooLargeError") {}

export const WorkspaceGitError = WorkspaceNotARepositoryError;

export const WorkspaceFileError = errorUnion(WorkspaceGitError, WorkspaceFileNotFoundError, WorkspaceBinaryFileError, WorkspaceFileTooLargeError);

export type WorkspaceChangeStatus = z.infer<typeof WorkspaceChangeStatus>;
export type WorkspaceChangeEntry = z.infer<typeof WorkspaceChangeEntry>;
export type WorkspaceGitError = ErrorOf<typeof WorkspaceGitError>;
export type WorkspaceFileError = ErrorOf<typeof WorkspaceFileError>;
