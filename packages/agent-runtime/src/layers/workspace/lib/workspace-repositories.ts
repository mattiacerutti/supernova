import {lstat, readdir, realpath} from "node:fs/promises";
import {join} from "node:path";
import {Effect} from "effect";
import {WorkspaceGenericError} from "@supernova/contracts/workspace/schemas";
import {optionalGit} from "@supernova/agent-runtime/layers/shared/lib/git/git-process";

/** A root is `"."` or the plain name of an immediate child directory, so it can never leave the project. */
export function repositoryPath(projectPath: string, repositoryRoot: string): Effect.Effect<string, WorkspaceGenericError> {
  if (repositoryRoot !== "." && (repositoryRoot === ".." || repositoryRoot.length === 0 || /[/\\]/.test(repositoryRoot))) {
    return Effect.fail(new WorkspaceGenericError({message: "Unknown repository."}));
  }
  return Effect.succeed(join(projectPath, repositoryRoot));
}

async function hasGitEntry(directory: string): Promise<boolean> {
  return lstat(join(directory, ".git")).then(
    () => true,
    () => false
  );
}

/** A candidate counts only when it is itself a worktree root, not a directory inside some other repository. */
async function isWorktreeRoot(directory: string): Promise<boolean> {
  const topLevel = await optionalGit(["-C", directory, "rev-parse", "--show-toplevel"]);
  if (!topLevel) return false;
  const [canonicalTopLevel, canonicalDirectory] = await Promise.all([realpath(topLevel.trim()), realpath(directory)]);
  return canonicalTopLevel === canonicalDirectory;
}

/**
 * Project-relative roots of the repositories at the project root and one level below it, sorted.
 * Same discovery rules as checkpoints: deeper repositories belong to whichever repository contains them.
 */
export function discoverWorkspaceRepositories(projectPath: string): Effect.Effect<readonly string[], WorkspaceGenericError> {
  return Effect.tryPromise({
    try: async () => {
      const children = (await readdir(projectPath, {withFileTypes: true})).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
      const candidates = [".", ...children.toSorted()];
      const accepted = await Promise.all(
        candidates.map(async (root) => {
          const directory = join(projectPath, root);
          return (await hasGitEntry(directory)) && (await isWorktreeRoot(directory)) ? root : undefined;
        })
      );
      return accepted.filter((root): root is string => root !== undefined);
    },
    catch: (cause) => new WorkspaceGenericError({cause, message: "Failed to inspect the project folder."}),
  });
}
