import type {CodeOf} from "@supernova/contracts/lib/errors";
import {failureOf} from "@supernova/contracts/lib/errors";
import {WorkspaceErrors} from "@supernova/contracts/services/workspace/services";

const GENERIC_MESSAGE = "Something went wrong loading this project.";

// A new contract error fails to compile here until it has copy.
const MESSAGES: Readonly<Record<CodeOf<typeof WorkspaceErrors.readFile>, string>> = {
  WorkspaceBinaryFileError: "Binary files cannot be previewed.",
  WorkspaceFileNotFoundError: "This file no longer exists.",
  WorkspaceFileTooLargeError: "This file is too large to preview.",
  WorkspaceNotARepositoryError: "This project is not a Git repository.",
};

export function workspaceErrorMessage(error: unknown): string {
  const code = failureOf(error, WorkspaceErrors.readFile);
  return code === undefined ? GENERIC_MESSAGE : MESSAGES[code];
}
