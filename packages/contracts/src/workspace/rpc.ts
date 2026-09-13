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
} from "@supernova/contracts/workspace/procedures";
import {WorkspaceFileError, WorkspaceGitError} from "@supernova/contracts/workspace/schemas";

export const WorkspaceFilesListRpc = Rpc.make("listWorkspaceFiles", {error: WorkspaceGitError, payload: WorkspaceFilesListPayload, success: WorkspaceFilesListResult});
export const WorkspaceChangesGetRpc = Rpc.make("getWorkspaceChanges", {error: WorkspaceGitError, payload: WorkspaceChangesGetPayload, success: WorkspaceChangesGetResult});
export const WorkspaceDiffContentsGetRpc = Rpc.make("getWorkspaceDiffContents", {
  error: WorkspaceFileError,
  payload: WorkspaceDiffContentsGetPayload,
  success: WorkspaceDiffContentsGetResult,
});
export const WorkspaceFileReadRpc = Rpc.make("readWorkspaceFile", {error: WorkspaceFileError, payload: WorkspaceFileReadPayload, success: WorkspaceFileReadResult});

export const WorkspaceRpcs = [WorkspaceFilesListRpc, WorkspaceChangesGetRpc, WorkspaceDiffContentsGetRpc, WorkspaceFileReadRpc] as const;
