import type {Context} from "@earendil-works/chord";
import {defineService} from "@earendil-works/chord";
import type {ServiceResult} from "@supernova/contracts/runtime/services";
import type {
  WorkspaceBranchesListPayload,
  WorkspaceBranchesListResult,
  WorkspaceChangesGetPayload,
  WorkspaceChangesGetResult,
  WorkspaceDiffContentsGetPayload,
  WorkspaceDiffContentsGetResult,
  WorkspaceFileReadPayload,
  WorkspaceFileReadResult,
  WorkspaceFilesListPayload,
  WorkspaceFilesListResult,
  WorkspaceRepositoriesListPayload,
  WorkspaceRepositoriesListResult,
} from "@supernova/contracts/workspace/procedures";
import type {WorkspaceFileError, WorkspaceGitError} from "@supernova/contracts/workspace/schemas";

/** A project's files and Git state. */
export interface WorkspaceService {
  listRepositories(payload: WorkspaceRepositoriesListPayload, context: Context): Promise<ServiceResult<WorkspaceRepositoriesListResult>>;
  listBranches(payload: WorkspaceBranchesListPayload, context: Context): Promise<ServiceResult<WorkspaceBranchesListResult, WorkspaceGitError>>;
  listFiles(payload: WorkspaceFilesListPayload, context: Context): Promise<ServiceResult<WorkspaceFilesListResult, WorkspaceGitError>>;
  getChanges(payload: WorkspaceChangesGetPayload, context: Context): Promise<ServiceResult<WorkspaceChangesGetResult, WorkspaceGitError>>;
  getDiffContents(payload: WorkspaceDiffContentsGetPayload, context: Context): Promise<ServiceResult<WorkspaceDiffContentsGetResult, WorkspaceFileError>>;
  readFile(payload: WorkspaceFileReadPayload, context: Context): Promise<ServiceResult<WorkspaceFileReadResult, WorkspaceFileError>>;
}

export const WorkspaceService = defineService<WorkspaceService>("supernova.workspace");
