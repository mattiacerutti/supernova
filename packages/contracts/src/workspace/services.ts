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

/** A project's files and Git state. Failures carry the `Workspace*Error` tags. */
export interface WorkspaceService {
  listRepositories(payload: WorkspaceRepositoriesListPayload, context: Context): Promise<ServiceResult<WorkspaceRepositoriesListResult>>;
  listBranches(payload: WorkspaceBranchesListPayload, context: Context): Promise<ServiceResult<WorkspaceBranchesListResult>>;
  listFiles(payload: WorkspaceFilesListPayload, context: Context): Promise<ServiceResult<WorkspaceFilesListResult>>;
  getChanges(payload: WorkspaceChangesGetPayload, context: Context): Promise<ServiceResult<WorkspaceChangesGetResult>>;
  getDiffContents(payload: WorkspaceDiffContentsGetPayload, context: Context): Promise<ServiceResult<WorkspaceDiffContentsGetResult>>;
  readFile(payload: WorkspaceFileReadPayload, context: Context): Promise<ServiceResult<WorkspaceFileReadResult>>;
}

export const WorkspaceService = defineService<WorkspaceService>("supernova.workspace");
