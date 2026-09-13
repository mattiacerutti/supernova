import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {Effect} from "effect";
import type {WorkspaceDiffContentsGetPayload} from "@supernova/contracts/workspace/procedures";
import {WorkspaceGenericError} from "@supernova/contracts/workspace/schemas";
import type {WorkspaceFileError} from "@supernova/contracts/workspace/schemas";
import {runGitResult} from "@supernova/agent-runtime/layers/shared/lib/git/git-process";
import {decodeWorkspaceFile, isWorkspaceError, workspaceGit} from "@supernova/agent-runtime/layers/workspace/lib/workspace-git";

/** A blob at a revision, or empty when the path did not exist there (untracked files). */
function blobAt(projectPath: string, revision: string, path: string): Effect.Effect<string, WorkspaceFileError> {
  return Effect.tryPromise({
    try: async () => {
      const output = await runGitResult(["cat-file", "-p", `${revision}:${path}`], {cwd: projectPath});
      return output.code === 0 ? decodeWorkspaceFile(Buffer.from(output.stdout, "utf8")) : "";
    },
    catch: (cause) => (isWorkspaceError(cause) ? cause : new WorkspaceGenericError({cause, message: "Failed to read file history."})),
  });
}

/** The working-tree file, or empty when it was deleted. */
function workingFile(projectPath: string, path: string): Effect.Effect<string, WorkspaceFileError> {
  return Effect.tryPromise({
    try: async () => decodeWorkspaceFile(await readFile(resolve(projectPath, path)).catch(() => Buffer.alloc(0))),
    catch: (cause) => (isWorkspaceError(cause) ? cause : new WorkspaceGenericError({cause, message: "Failed to read file."})),
  });
}

/** Both sides of a file's uncommitted change: HEAD and the working tree. */
export function getWorkspaceDiffContents(input: WorkspaceDiffContentsGetPayload) {
  const {path, projectPath} = input;
  const sides = Effect.all([blobAt(projectPath, "HEAD", path), workingFile(projectPath, path)]);
  // Probing the repository first keeps the not-a-repository reason consistent with the other operations.
  return Effect.map(Effect.andThen(workspaceGit(projectPath, ["rev-parse", "--verify", "HEAD"]), sides), ([oldContents, newContents]) => ({newContents, oldContents}));
}
