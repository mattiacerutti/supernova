import {readFile} from "node:fs/promises";
import {join} from "node:path";
import type {
  WorkspaceBranch,
  WorkspaceBranchesListPayload,
  WorkspaceBranchesListResult,
  WorkspaceChangesGetPayload,
  WorkspaceChangesGetResult,
  WorkspaceDiffContentsGetPayload,
  WorkspaceDiffContentsGetResult,
  WorkspaceFileReadPayload,
  WorkspaceFileReadResult,
  WorkspaceFilesListPayload,
  WorkspaceFilesListResult,
  WorkspaceRepositoriesListPayload,
  WorkspaceRepositoriesListResult,
} from "@supernova/contracts/workspace/procedures";
import type {WorkspaceChangeEntry} from "@supernova/contracts/workspace/schemas";
import {WorkspaceFileNotFoundError, WorkspaceNotARepositoryError} from "@supernova/contracts/workspace/schemas";
import {parseNameStatus, parseNumstat} from "@supernova/agent-runtime/features/workspace/lib/diff-output";
import {decodeWorkspaceFile, workspaceGit} from "@supernova/agent-runtime/features/workspace/lib/git";
import {pathInProject} from "@supernova/agent-runtime/features/workspace/lib/paths";
import {discoverWorkspaceRepositories, repositoryPath} from "@supernova/agent-runtime/features/workspace/lib/repositories";
import {runGitResult} from "@supernova/agent-runtime/lib/git-process";

/** An untracked file has no HEAD side, so its whole content counts as additions. */
async function untrackedEntry(repository: string, path: string): Promise<WorkspaceChangeEntry> {
  const output = await workspaceGit(repository, ["diff", "--no-index", "--numstat", "-z", "--", "/dev/null", path], [0, 1]);
  return {...(parseNumstat(output).get(path) ?? {additions: 0, deletions: 0}), path, status: "untracked"};
}

/** A blob at a revision, or empty when the path did not exist there (untracked files). */
async function blobAt(repository: string, revision: string, path: string): Promise<string> {
  const output = await runGitResult(["cat-file", "-p", `${revision}:${path}`], {cwd: repository});
  return output.code === 0 ? decodeWorkspaceFile(Buffer.from(output.stdout, "utf8")) : "";
}

/** The working-tree file. Empty when it was deleted, and likewise when the path leaves the repository, which has nothing to show. */
async function workingFile(repository: string, path: string): Promise<string> {
  const target = await pathInProject(repository, path);
  return target ? decodeWorkspaceFile(await readFile(target)) : "";
}

/** Files on disk that Git considers part of one repository: tracked (minus deleted) plus untracked and not ignored. */
async function repositoryFiles(projectPath: string, root: string): Promise<string[]> {
  const repository = join(projectPath, root);
  const [listed, deleted] = await Promise.all([
    workspaceGit(repository, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]),
    workspaceGit(repository, ["ls-files", "-z", "--deleted"]),
  ]);
  const missing = new Set(deleted.split("\0"));
  return (
    listed
      .split("\0")
      // A nested repository is listed as `dir/`; its own listing supplies the files below it.
      .filter((path) => path.length > 0 && !path.endsWith("/") && !missing.has(path))
      .map((path) => (root === "." ? path : `${root}/${path}`))
  );
}

/** `git worktree list --porcelain` as branch → worktree path. */
function parseWorktreeBranches(output: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const block of output.split("\n\n")) {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1];
    if (path && branch) result.set(branch, path);
  }
  return result;
}

/** Read-only view of a project's files and uncommitted Git changes. */
export class Workspace {
  /** Local branches by most recent commit, then remote-tracking branches, with the worktree each is checked out in. */
  public async listBranches(input: WorkspaceBranchesListPayload): Promise<WorkspaceBranchesListResult> {
    const {projectPath} = input;
    const [refs, worktrees, head] = await Promise.all([
      workspaceGit(projectPath, ["for-each-ref", "--sort=-committerdate", "--format=%(refname)", "refs/heads", "refs/remotes"]),
      workspaceGit(projectPath, ["worktree", "list", "--porcelain"]),
      workspaceGit(projectPath, ["symbolic-ref", "--quiet", "--short", "HEAD"], [0, 1]),
    ]);
    const worktreeByBranch = parseWorktreeBranches(worktrees);
    const local: WorkspaceBranch[] = [];
    const remote: WorkspaceBranch[] = [];
    for (const ref of refs.split("\n")) {
      if (ref.startsWith("refs/heads/")) {
        const name = ref.slice("refs/heads/".length);
        const worktreePath = worktreeByBranch.get(name);
        local.push({name, remote: false, ...(worktreePath ? {worktreePath} : {})});
      } else if (ref.startsWith("refs/remotes/") && !ref.endsWith("/HEAD")) {
        remote.push({name: ref.slice("refs/remotes/".length), remote: true});
      }
    }
    const current = head.trim();
    return {branches: [...local, ...remote], ...(current ? {current} : {})};
  }

  /** Every change against HEAD, staged or not, plus untracked files with their line counts. */
  public async getChanges(input: WorkspaceChangesGetPayload): Promise<WorkspaceChangesGetResult> {
    const repository = await repositoryPath(input.projectPath, input.repositoryRoot);
    const [nameStatus, numstat, untracked] = await Promise.all([
      workspaceGit(repository, ["diff", "HEAD", "--name-status", "-z", "-M"]),
      workspaceGit(repository, ["diff", "HEAD", "--numstat", "-z", "-M"]),
      workspaceGit(repository, ["ls-files", "-z", "--others", "--exclude-standard"]),
    ]);
    const tracked = parseNameStatus(nameStatus, parseNumstat(numstat));
    // A nested repository is listed as `dir/`; it has its own change list.
    const untrackedPaths = untracked.split("\0").filter((path) => path.length > 0 && !path.endsWith("/"));
    const untrackedEntries = await Promise.all(untrackedPaths.map((path) => untrackedEntry(repository, path)));
    return {uncommitted: [...tracked, ...untrackedEntries]};
  }

  /** Both sides of a file's uncommitted change: HEAD and the working tree. */
  public async getDiffContents(input: WorkspaceDiffContentsGetPayload): Promise<WorkspaceDiffContentsGetResult> {
    const repository = await repositoryPath(input.projectPath, input.repositoryRoot);
    // Probing the repository first keeps the not-a-repository reason consistent with the other operations.
    await workspaceGit(repository, ["rev-parse", "--verify", "HEAD"]);
    const [oldContents, newContents] = await Promise.all([blobAt(repository, "HEAD", input.path), workingFile(repository, input.path)]);
    return {newContents, oldContents};
  }

  public async listRepositories(input: WorkspaceRepositoriesListPayload): Promise<WorkspaceRepositoriesListResult> {
    return {repositories: await discoverWorkspaceRepositories(input.projectPath)};
  }

  /**
   * The files of every discovered repository, as project-relative paths. Like checkpoints, this sees one level of
   * nesting: loose files outside any repository and files inside repositories deeper than an immediate child are not listed.
   */
  public async listFiles(input: WorkspaceFilesListPayload): Promise<WorkspaceFilesListResult> {
    const roots = await discoverWorkspaceRepositories(input.projectPath);
    if (roots.length === 0) throw new WorkspaceNotARepositoryError({message: "Not a Git repository."});
    const files = await Promise.all(roots.map((root) => repositoryFiles(input.projectPath, root)));
    return {files: files.flat()};
  }

  /** Reads a project file as UTF-8, refusing paths that escape the project. */
  public async readFile(input: WorkspaceFileReadPayload): Promise<WorkspaceFileReadResult> {
    const target = await pathInProject(input.projectPath, input.path);
    if (!target) throw new WorkspaceFileNotFoundError({message: "File not found."});
    return {content: decodeWorkspaceFile(await readFile(target))};
  }
}
