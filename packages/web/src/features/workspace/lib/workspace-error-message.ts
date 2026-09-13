import type {WorkspaceFileError} from "@supernova/contracts/workspace/schemas";
import type {InferQueryErrorResult} from "effect-query";
import type {RpcClientError} from "effect/unstable/rpc/RpcClientError";

const GENERIC_MESSAGE = "Something went wrong loading this project.";

/** User-facing copy for a failed workspace query. Transport failures and defects get the generic message. */
export function workspaceErrorMessage(error: InferQueryErrorResult<WorkspaceFileError | RpcClientError>): string {
  return error.match({
    OrElse: () => GENERIC_MESSAGE,
    WorkspaceBinaryFileError: () => "Binary files cannot be previewed.",
    WorkspaceFileNotFoundError: () => "This file no longer exists.",
    WorkspaceFileTooLargeError: () => "This file is too large to preview.",
    WorkspaceNotARepositoryError: () => "This project is not a Git repository.",
  });
}
