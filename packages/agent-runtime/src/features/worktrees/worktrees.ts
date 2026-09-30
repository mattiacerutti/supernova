import {realpath} from "node:fs/promises";
import {homedir} from "node:os";
import {basename, join, resolve} from "node:path";
import type {SessionWorktree} from "@supernova/contracts/sessions/schemas";
import {randomBranchName, uniqueBranchName} from "@supernova/agent-runtime/features/worktrees/lib/branch-name";
import {optionalGit, runGit, runGitResult} from "@supernova/agent-runtime/lib/git-process";

function defaultStorageRoot(): string {
  const agentDataRoot = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".supernova", "userdata", "agent");
  return join(resolve(agentDataRoot), "worktrees");
}

/** Git worktrees Supernova creates for sessions, stored outside the project so they never show up as project files. */
export class Worktrees {
  private readonly storageRoot: string;

  public constructor(storageRoot = defaultStorageRoot()) {
    this.storageRoot = storageRoot;
  }

  /** Creates a worktree on a new, randomly named branch off `baseRef`. */
  public async create(input: {readonly baseRef: string; readonly projectPath: string}): Promise<SessionWorktree> {
    const {baseRef, projectPath} = input;
    const taken = new Set((await optionalGit(["for-each-ref", "--format=%(refname:short)", "refs/heads"], {cwd: projectPath}))?.split("\n") ?? []);
    const branch = uniqueBranchName(randomBranchName(), taken);
    const path = join(this.storageRoot, basename(projectPath), branch.replaceAll("/", "-"));
    await runGit(["worktree", "add", "-b", branch, path, baseRef], {cwd: projectPath});
    // Git reports worktrees by their real path; store the same so branch listings match the session.
    return {branch, path: await realpath(path)};
  }

  /** Removes the worktree and its branch, including uncommitted work. A worktree already gone is not an error. */
  public async remove(input: {readonly projectPath: string; readonly worktree: SessionWorktree}): Promise<void> {
    const {projectPath, worktree} = input;
    const removed = await runGitResult(["worktree", "remove", "--force", worktree.path], {cwd: projectPath});
    if (removed.code !== 0 && !/is not a working tree|does not exist|No such file/i.test(removed.stderr)) {
      throw new Error(`Git command failed: ${removed.stderr.trim()}`);
    }
    await runGitResult(["worktree", "prune"], {cwd: projectPath});
    await runGitResult(["branch", "-D", worktree.branch], {cwd: projectPath});
  }
}
