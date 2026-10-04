import type {WorkspaceService} from "@supernova/contracts/services/workspace/services";
import type {FailureCode} from "@/runtime/runtime-result";
import {runtimeError} from "@/runtime/runtime-result";

const GENERIC_MESSAGE = "Something went wrong loading this project.";

type WorkspaceFailureCode = FailureCode<WorkspaceService["readFile"]>;

/** Copy for every code a workspace read can fail with; adding an error to the contract fails this until it has copy. */
const MESSAGES: Readonly<Record<WorkspaceFailureCode, string>> = {
  GenericError: GENERIC_MESSAGE,
  WorkspaceBinaryFileError: "Binary files cannot be previewed.",
  WorkspaceFileNotFoundError: "This file no longer exists.",
  WorkspaceFileTooLargeError: "This file is too large to preview.",
  WorkspaceNotARepositoryError: "This project is not a Git repository.",
};

/** User-facing copy for a failed workspace query. Transport failures get the generic message. */
export function workspaceErrorMessage(error: unknown): string {
  const code = runtimeError<WorkspaceService["readFile"]>(error)?.code;
  return code === undefined ? GENERIC_MESSAGE : MESSAGES[code];
}
