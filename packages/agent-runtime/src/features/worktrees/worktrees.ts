import {realpath} from "node:fs/promises";
import {basename, join} from "node:path";
import type {SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import {randomBranchName, uniqueBranchName} from "@supernova/agent-runtime/features/worktrees/lib/branch-name";
import {optionalGit, runGit, runGitResult} from "@supernova/agent-runtime/lib/git-process";
import {resolveProjectPath} from "@supernova/agent-runtime/lib/project-path";

export async function createWorktree(input: {readonly baseRef: string; readonly projectPath: string; readonly storageRoot: string}): Promise<SessionWorktree> {
  const {baseRef, projectPath, storageRoot} = input;
  const taken = new Set((await optionalGit(["for-each-ref", "--format=%(refname:short)", "refs/heads"], {cwd: projectPath}))?.split("\n") ?? []);
  const branch = uniqueBranchName(randomBranchName(), taken);
  const path = join(storageRoot, basename(projectPath), branch.replaceAll("/", "-"));
  await runGit(["worktree", "add", "-b", branch, path, baseRef], {cwd: projectPath});
  // Git reports worktrees by their real path; store the same so branch listings match the session.
  return {branch, path: resolveProjectPath(await realpath(path))};
}

export async function removeWorktree(input: {readonly projectPath: string; readonly worktree: SessionWorktree}): Promise<void> {
  const {projectPath, worktree} = input;
  const removed = await runGitResult(["worktree", "remove", "--force", worktree.path], {cwd: projectPath});
  if (removed.code !== 0 && !/is not a working tree|does not exist|No such file/i.test(removed.stderr)) {
    throw new Error(`Git command failed: ${removed.stderr.trim()}`);
  }
  await runGitResult(["worktree", "prune"], {cwd: projectPath});
  await runGitResult(["branch", "-D", worktree.branch], {cwd: projectPath});
}
