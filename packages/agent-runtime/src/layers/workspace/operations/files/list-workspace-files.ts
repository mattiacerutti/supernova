import {join} from "node:path";
import {Effect} from "effect";
import {WorkspaceNotARepositoryError} from "@supernova/contracts/workspace/schemas";
import {workspaceGit} from "@supernova/agent-runtime/layers/workspace/lib/workspace-git";
import {discoverWorkspaceRepositories} from "@supernova/agent-runtime/layers/workspace/lib/workspace-repositories";

/** Files on disk that Git considers part of one repository: tracked (minus deleted) plus untracked and not ignored. */
function repositoryFiles(projectPath: string, root: string) {
  const repository = join(projectPath, root);
  return Effect.map(
    Effect.all([workspaceGit(repository, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]), workspaceGit(repository, ["ls-files", "-z", "--deleted"])]),
    ([listed, deleted]) => {
      const missing = new Set(deleted.split("\0"));
      return (
        listed
          .split("\0")
          // A nested repository is listed as `dir/`; its own listing supplies the files below it.
          .filter((path) => path.length > 0 && !path.endsWith("/") && !missing.has(path))
          .map((path) => (root === "." ? path : `${root}/${path}`))
      );
    }
  );
}

/**
 * The files of every discovered repository, as project-relative paths. Like checkpoints, this sees one level of
 * nesting: loose files outside any repository and files inside repositories deeper than an immediate child are not listed.
 */
export function listWorkspaceFiles(projectPath: string) {
  return Effect.gen(function* () {
    const roots = yield* discoverWorkspaceRepositories(projectPath);
    if (roots.length === 0) return yield* new WorkspaceNotARepositoryError({message: "Not a Git repository."});
    const files = yield* Effect.forEach(roots, (root) => repositoryFiles(projectPath, root), {concurrency: 4});
    return {files: files.flat()};
  });
}
