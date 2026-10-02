import {errorCode} from "@/rpc/runtime-result";

const GENERIC_MESSAGE = "Something went wrong loading this project.";

const MESSAGES: Readonly<Record<string, string>> = {
  WorkspaceBinaryFileError: "Binary files cannot be previewed.",
  WorkspaceFileNotFoundError: "This file no longer exists.",
  WorkspaceFileTooLargeError: "This file is too large to preview.",
  WorkspaceNotARepositoryError: "This project is not a Git repository.",
};

/** User-facing copy for a failed workspace query. Transport failures and defects get the generic message. */
export function workspaceErrorMessage(error: unknown): string {
  return MESSAGES[errorCode(error) ?? ""] ?? GENERIC_MESSAGE;
}
