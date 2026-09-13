import {Effect} from "effect";
import {workspaceGit} from "@supernova/agent-runtime/layers/workspace/lib/workspace-git";

/** Files on disk that Git considers part of the project: tracked (minus deleted) plus untracked and not ignored. */
export function listWorkspaceFiles(projectPath: string) {
  return Effect.map(
    Effect.all([workspaceGit(projectPath, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]), workspaceGit(projectPath, ["ls-files", "-z", "--deleted"])]),
    ([listed, deleted]) => {
      const missing = new Set(deleted.split("\0"));
      return {files: listed.split("\0").filter((path) => path.length > 0 && !missing.has(path))};
    }
  );
}
