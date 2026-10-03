import {WorkspaceBinaryFileError, WorkspaceFileTooLargeError, WorkspaceNotARepositoryError} from "@supernova/contracts/workspace/schemas";
import {runGitResult} from "@supernova/agent-runtime/lib/git-process";

/** Previews stay under this so a future editor never has to save a truncated file. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8_000;

/** Decodes file bytes for the viewer, refusing binaries and anything over the size cap. */
export function decodeWorkspaceFile(buffer: Buffer): string {
  if (buffer.byteLength > MAX_FILE_BYTES) throw new WorkspaceFileTooLargeError({message: "File is too large to preview."});
  if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) throw new WorkspaceBinaryFileError({message: "Binary files cannot be previewed."});
  return buffer.toString("utf8");
}

/**
 * Runs Git in a repository. A missing repository is detected up front so the UI gets one stable
 * reason instead of whatever message the particular command prints. `git diff --no-index` exits
 * 1 when the files differ, so callers that expect that pass `okCodes`.
 */
export async function workspaceGit(repositoryPath: string, args: readonly string[], okCodes: readonly number[] = [0]): Promise<string> {
  let probe;
  try {
    probe = await runGitResult(["rev-parse", "--is-inside-work-tree"], {cwd: repositoryPath});
  } catch (cause) {
    throw new Error("Git is not available.", {cause});
  }
  if (probe.code !== 0) throw new WorkspaceNotARepositoryError({message: "Not a Git repository."});

  const output = await runGitResult(args, {cwd: repositoryPath});
  if (okCodes.includes(output.code)) return output.stdout;
  throw new Error(output.stderr.trim());
}
