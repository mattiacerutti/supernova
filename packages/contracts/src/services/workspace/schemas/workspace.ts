import {num, obj, oneOf, type Static, str} from "@earendil-works/chord";
import {errorUnion, TaggedError} from "@supernova/contracts/lib/errors";

export const WorkspaceChangeStatus = oneOf("added", "deleted", "modified", "renamed", "untracked");

export const WorkspaceChangeEntry = obj({
  additions: num(),
  deletions: num(),
  path: str(),
  status: WorkspaceChangeStatus,
});

export class WorkspaceNotARepositoryError extends TaggedError("WorkspaceNotARepositoryError") {}

export class WorkspaceFileNotFoundError extends TaggedError("WorkspaceFileNotFoundError") {}

export class WorkspaceBinaryFileError extends TaggedError("WorkspaceBinaryFileError") {}

export class WorkspaceFileTooLargeError extends TaggedError("WorkspaceFileTooLargeError") {}

export const WorkspaceGitError = WorkspaceNotARepositoryError;

export const WorkspaceFileError = errorUnion(WorkspaceGitError, WorkspaceFileNotFoundError, WorkspaceBinaryFileError, WorkspaceFileTooLargeError);

export type WorkspaceChangeStatus = Static<typeof WorkspaceChangeStatus>;
export type WorkspaceChangeEntry = Static<typeof WorkspaceChangeEntry>;
