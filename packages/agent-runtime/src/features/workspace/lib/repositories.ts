import {lstat, readdir, realpath} from "node:fs/promises";
import {join} from "node:path";
import {pathInProject} from "@supernova/agent-runtime/features/workspace/lib/paths";
import {optionalGit} from "@supernova/agent-runtime/lib/git-process";

/** A symlinked child is never discovered, so accepting one would let a request read outside the project. */
export async function repositoryPath(projectPath: string, repositoryRoot: string): Promise<string> {
  if (repositoryRoot !== "." && (repositoryRoot === ".." || repositoryRoot.length === 0 || /[/\\]/.test(repositoryRoot))) {
    throw new Error("Unknown repository.");
  }
  const resolved = await pathInProject(projectPath, repositoryRoot);
  if (resolved === undefined) throw new Error("Unknown repository.");
  return resolved;
}

async function hasGitEntry(directory: string): Promise<boolean> {
  return lstat(join(directory, ".git")).then(
    () => true,
    () => false
  );
}

async function isWorktreeRoot(directory: string): Promise<boolean> {
  const topLevel = await optionalGit(["-C", directory, "rev-parse", "--show-toplevel"]);
  if (!topLevel) return false;
  const [canonicalTopLevel, canonicalDirectory] = await Promise.all([realpath(topLevel.trim()), realpath(directory)]);
  return canonicalTopLevel === canonicalDirectory;
}

export async function discoverWorkspaceRepositories(projectPath: string): Promise<string[]> {
  let children: string[];
  try {
    children = (await readdir(projectPath, {withFileTypes: true})).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (cause) {
    throw new Error("Failed to inspect the project folder.", {cause});
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
