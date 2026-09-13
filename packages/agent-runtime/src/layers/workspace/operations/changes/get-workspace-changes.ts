import {Effect} from "effect";
import type {WorkspaceChangeEntry, WorkspaceGitError} from "@supernova/contracts/workspace/schemas";
import {parseNameStatus, parseNumstat} from "@supernova/agent-runtime/layers/workspace/lib/changes/diff-output";
import {workspaceGit} from "@supernova/agent-runtime/layers/workspace/lib/workspace-git";

/** Every change against HEAD, staged or not, plus untracked files with their line counts. */
export function getWorkspaceChanges(projectPath: string) {
  return Effect.gen(function* () {
    const [nameStatus, numstat, untracked] = yield* Effect.all([
      workspaceGit(projectPath, ["diff", "HEAD", "--name-status", "-z", "-M"]),
      workspaceGit(projectPath, ["diff", "HEAD", "--numstat", "-z", "-M"]),
      workspaceGit(projectPath, ["ls-files", "-z", "--others", "--exclude-standard"]),
    ]);
    const tracked = parseNameStatus(nameStatus, parseNumstat(numstat));
    const untrackedPaths = untracked.split("\0").filter((path) => path.length > 0);
    const untrackedEntries = yield* Effect.forEach(untrackedPaths, (path) => untrackedEntry(projectPath, path), {concurrency: 8});
    return {uncommitted: [...tracked, ...untrackedEntries]};
  });
}

/** An untracked file has no HEAD side, so its whole content counts as additions. */
function untrackedEntry(projectPath: string, path: string): Effect.Effect<WorkspaceChangeEntry, WorkspaceGitError> {
  return Effect.map(workspaceGit(projectPath, ["diff", "--no-index", "--numstat", "-z", "--", "/dev/null", path], [0, 1]), (output) => ({
    ...(parseNumstat(output).get(path) ?? {additions: 0, deletions: 0}),
    path,
    status: "untracked" as const,
  }));
}
