import {Effect} from "effect";
import {
  WorkspaceBinaryFileError,
  WorkspaceFileNotFoundError,
  WorkspaceFileTooLargeError,
  WorkspaceGenericError,
  WorkspaceNotARepositoryError,
} from "@supernova/contracts/workspace/schemas";
import type {WorkspaceFileError, WorkspaceGitError} from "@supernova/contracts/workspace/schemas";

/** Previews stay under this so a future editor never has to save a truncated file. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8_000;

/** Errors thrown inside `tryPromise` bodies are rethrown as-is rather than wrapped. */
export function isWorkspaceError(cause: unknown): cause is WorkspaceFileError {
  return (
    cause instanceof WorkspaceGenericError ||
    cause instanceof WorkspaceNotARepositoryError ||
    cause instanceof WorkspaceFileNotFoundError ||
    cause instanceof WorkspaceBinaryFileError ||
    cause instanceof WorkspaceFileTooLargeError
  );
}

/** Decodes file bytes for the viewer, refusing binaries and anything over the size cap. */
export function decodeWorkspaceFile(buffer: Buffer): string {
  if (buffer.byteLength > MAX_FILE_BYTES) throw new WorkspaceFileTooLargeError({message: "File is too large to preview."});
  if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) throw new WorkspaceBinaryFileError({message: "Binary files cannot be previewed."});
  return buffer.toString("utf8");
}
import {runGitResult} from "@supernova/agent-runtime/layers/shared/lib/git/git-process";

/**
 * Runs Git in the project. A missing repository is detected up front so the UI gets one stable
 * reason instead of whatever message the particular command prints. `git diff --no-index` exits
 * 1 when the files differ, so callers that expect that pass `okCodes`.
 */
export function workspaceGit(projectPath: string, args: readonly string[], okCodes: readonly number[] = [0]): Effect.Effect<string, WorkspaceGitError> {
  return Effect.tryPromise({
    try: async () => {
      const probe = await runGitResult(["rev-parse", "--is-inside-work-tree"], {cwd: projectPath});
      if (probe.code !== 0) throw new WorkspaceNotARepositoryError({message: "Not a Git repository."});
      const output = await runGitResult(args, {cwd: projectPath});
      if (okCodes.includes(output.code)) return output.stdout;
      throw new WorkspaceGenericError({message: output.stderr.trim()});
    },
    catch: (cause) =>
      cause instanceof WorkspaceGenericError || cause instanceof WorkspaceNotARepositoryError ? cause : new WorkspaceGenericError({cause, message: "Git is not available."}),
  });
}
