import * as Rpc from "effect/unstable/rpc/Rpc";
import {
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
import {WorkspaceFileError, WorkspaceGenericError, WorkspaceGitError} from "@supernova/contracts/workspace/schemas";

export const WorkspaceRepositoriesListRpc = Rpc.make("listWorkspaceRepositories", {
  error: WorkspaceGenericError,
  payload: WorkspaceRepositoriesListPayload,
  success: WorkspaceRepositoriesListResult,
});
export const WorkspaceFilesListRpc = Rpc.make("listWorkspaceFiles", {error: WorkspaceGitError, payload: WorkspaceFilesListPayload, success: WorkspaceFilesListResult});
export const WorkspaceChangesGetRpc = Rpc.make("getWorkspaceChanges", {error: WorkspaceGitError, payload: WorkspaceChangesGetPayload, success: WorkspaceChangesGetResult});
export const WorkspaceDiffContentsGetRpc = Rpc.make("getWorkspaceDiffContents", {
  error: WorkspaceFileError,
  payload: WorkspaceDiffContentsGetPayload,
  success: WorkspaceDiffContentsGetResult,
});
export const WorkspaceFileReadRpc = Rpc.make("readWorkspaceFile", {error: WorkspaceFileError, payload: WorkspaceFileReadPayload, success: WorkspaceFileReadResult});

export const WorkspaceRpcs = [WorkspaceRepositoriesListRpc, WorkspaceFilesListRpc, WorkspaceChangesGetRpc, WorkspaceDiffContentsGetRpc, WorkspaceFileReadRpc] as const;
