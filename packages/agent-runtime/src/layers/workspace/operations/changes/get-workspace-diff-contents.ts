import {readFile} from "node:fs/promises";
import {Effect} from "effect";
import type {WorkspaceDiffContentsGetPayload} from "@supernova/contracts/workspace/procedures";
import {WorkspaceGenericError} from "@supernova/contracts/workspace/schemas";
import type {WorkspaceFileError} from "@supernova/contracts/workspace/schemas";
import {runGitResult} from "@supernova/agent-runtime/layers/shared/lib/git/git-process";
import {decodeWorkspaceFile, isWorkspaceError, workspaceGit} from "@supernova/agent-runtime/layers/workspace/lib/workspace-git";
import {pathInProject} from "@supernova/agent-runtime/layers/workspace/lib/workspace-paths";
import {repositoryPath} from "@supernova/agent-runtime/layers/workspace/lib/workspace-repositories";

/** A blob at a revision, or empty when the path did not exist there (untracked files). */
function blobAt(repository: string, revision: string, path: string): Effect.Effect<string, WorkspaceFileError> {
  return Effect.tryPromise({
    try: async () => {
      const output = await runGitResult(["cat-file", "-p", `${revision}:${path}`], {cwd: repository});
      return output.code === 0 ? decodeWorkspaceFile(Buffer.from(output.stdout, "utf8")) : "";
    },
    catch: (cause) => (isWorkspaceError(cause) ? cause : new WorkspaceGenericError({cause, message: "Failed to read file history."})),
  });
}

/** The working-tree file. Empty when it was deleted, and likewise when the path leaves the repository, which has nothing to show. */
function workingFile(repository: string, path: string): Effect.Effect<string, WorkspaceFileError> {
  return Effect.tryPromise({
    try: async () => {
      const target = await pathInProject(repository, path);
      return target ? decodeWorkspaceFile(await readFile(target)) : "";
    },
    catch: (cause) => (isWorkspaceError(cause) ? cause : new WorkspaceGenericError({cause, message: "Failed to read file."})),
  });
}

/** Both sides of a file's uncommitted change: HEAD and the working tree. */
export function getWorkspaceDiffContents(input: WorkspaceDiffContentsGetPayload) {
  return Effect.gen(function* () {
    const repository = yield* repositoryPath(input.projectPath, input.repositoryRoot);
    // Probing the repository first keeps the not-a-repository reason consistent with the other operations.
    yield* workspaceGit(repository, ["rev-parse", "--verify", "HEAD"]);
    const [oldContents, newContents] = yield* Effect.all([blobAt(repository, "HEAD", input.path), workingFile(repository, input.path)]);
    return {newContents, oldContents};
  });
}
