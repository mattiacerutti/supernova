import {Effect} from "effect";
import type {WorkspaceChangesGetPayload} from "@supernova/contracts/workspace/procedures";
import type {WorkspaceChangeEntry, WorkspaceGitError} from "@supernova/contracts/workspace/schemas";
import {parseNameStatus, parseNumstat} from "@supernova/agent-runtime/layers/workspace/lib/changes/diff-output";
import {workspaceGit} from "@supernova/agent-runtime/layers/workspace/lib/workspace-git";
import {repositoryPath} from "@supernova/agent-runtime/layers/workspace/lib/workspace-repositories";

/** Every change against HEAD, staged or not, plus untracked files with their line counts. */
export function getWorkspaceChanges(input: WorkspaceChangesGetPayload) {
  return Effect.gen(function* () {
    const repository = yield* repositoryPath(input.projectPath, input.repositoryRoot);
    const [nameStatus, numstat, untracked] = yield* Effect.all([
      workspaceGit(repository, ["diff", "HEAD", "--name-status", "-z", "-M"]),
      workspaceGit(repository, ["diff", "HEAD", "--numstat", "-z", "-M"]),
      workspaceGit(repository, ["ls-files", "-z", "--others", "--exclude-standard"]),
    ]);
    const tracked = parseNameStatus(nameStatus, parseNumstat(numstat));
    // A nested repository is listed as `dir/`; it has its own change list.
    const untrackedPaths = untracked.split("\0").filter((path) => path.length > 0 && !path.endsWith("/"));
    const untrackedEntries = yield* Effect.forEach(untrackedPaths, (path) => untrackedEntry(repository, path), {concurrency: 8});
    return {uncommitted: [...tracked, ...untrackedEntries]};
  });
}

/** An untracked file has no HEAD side, so its whole content counts as additions. */
function untrackedEntry(repository: string, path: string): Effect.Effect<WorkspaceChangeEntry, WorkspaceGitError> {
  return Effect.map(workspaceGit(repository, ["diff", "--no-index", "--numstat", "-z", "--", "/dev/null", path], [0, 1]), (output) => ({
    ...(parseNumstat(output).get(path) ?? {additions: 0, deletions: 0}),
    path,
    status: "untracked" as const,
  }));
}
