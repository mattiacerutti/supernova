import {lstat, readdir, realpath} from "node:fs/promises";
import {join} from "node:path";
import {WorkspaceGenericError} from "@supernova/contracts/workspace/schemas";
import {pathInProject} from "@supernova/agent-runtime/features/workspace/lib/paths";
import {optionalGit} from "@supernova/agent-runtime/lib/git-process";

/**
 * Resolves a client-supplied repository root. It must be `"."` or the plain name of an immediate child
 * directory, and must still be inside the project once symlinks are followed: a symlinked child is never
 * discovered, so accepting one would let a request read a repository outside the project.
 */
export async function repositoryPath(projectPath: string, repositoryRoot: string): Promise<string> {
  if (repositoryRoot !== "." && (repositoryRoot === ".." || repositoryRoot.length === 0 || /[/\\]/.test(repositoryRoot))) {
    throw new WorkspaceGenericError({message: "Unknown repository."});
  }
  const resolved = await pathInProject(projectPath, repositoryRoot);
  if (resolved === undefined) throw new WorkspaceGenericError({message: "Unknown repository."});
  return resolved;
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
export async function discoverWorkspaceRepositories(projectPath: string): Promise<readonly string[]> {
  let children: string[];
  try {
    children = (await readdir(projectPath, {withFileTypes: true})).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (cause) {
    throw new WorkspaceGenericError({cause, message: "Failed to inspect the project folder."});
  }
  const candidates = [".", ...children.toSorted()];
  const accepted = await Promise.all(
    candidates.map(async (root) => {
      const directory = join(projectPath, root);
      return (await hasGitEntry(directory)) && (await isWorktreeRoot(directory)) ? root : undefined;
    })
  );
  return accepted.filter((root): root is string => root !== undefined);
}
