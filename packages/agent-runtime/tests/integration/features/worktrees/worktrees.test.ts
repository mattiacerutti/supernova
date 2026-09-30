import {execFile} from "node:child_process";
import {existsSync} from "node:fs";
import {mkdtemp, realpath, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {afterEach, describe, expect, it} from "vitest";
import {Workspace} from "@supernova/agent-runtime/features/workspace/workspace";
import {Worktrees} from "@supernova/agent-runtime/features/worktrees/worktrees";
import {cleanupTempDirs} from "@tests/support/async";

const exec = promisify(execFile);
const gitEnv = {...process.env, GIT_AUTHOR_NAME: "Ada", GIT_AUTHOR_EMAIL: "a@x", GIT_COMMITTER_NAME: "Ada", GIT_COMMITTER_EMAIL: "a@x"};

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, {cwd, env: gitEnv})).stdout.trim();
}

async function createRepo(tempDirs: string[]): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "supernova-worktrees-repo-"));
  tempDirs.push(repo);
  await git(repo, "init", "-q", "-b", "main");
  await writeFile(join(repo, "a.txt"), "a\n");
  await git(repo, "add", "-A");
  await git(repo, "commit", "-q", "-m", "first");
  return repo;
}

describe("Worktrees", () => {
  const tempDirs: string[] = [];

  afterEach(() => cleanupTempDirs(tempDirs));

  it("creates a worktree on a new branch off the base ref and lists it", async () => {
    const repo = await createRepo(tempDirs);
    const storage = await mkdtemp(join(tmpdir(), "supernova-worktrees-"));
    tempDirs.push(storage);
    const worktrees = new Worktrees(storage);

    const worktree = await worktrees.create({baseRef: "main", projectPath: repo});

    expect(worktree.branch).toMatch(/^supernova\/[a-z]+-[a-z]+$/);
    expect(worktree.path.startsWith(await realpath(storage))).toBe(true);
    expect(await git(worktree.path, "rev-parse", "--abbrev-ref", "HEAD")).toBe(worktree.branch);
    expect(existsSync(join(worktree.path, "a.txt"))).toBe(true);

    const branches = await new Workspace().listBranches({projectPath: repo});
    expect(branches.current).toBe("main");
    expect(branches.branches).toContainEqual({name: worktree.branch, remote: false, worktreePath: worktree.path});
    expect(branches.branches.find((branch) => branch.name === "main")).toMatchObject({remote: false, worktreePath: await realpath(repo)});
  });

  it("removes the worktree and its branch even with uncommitted work, and tolerates a worktree already gone", async () => {
    const repo = await createRepo(tempDirs);
    const storage = await mkdtemp(join(tmpdir(), "supernova-worktrees-"));
    tempDirs.push(storage);
    const worktrees = new Worktrees(storage);
    const worktree = await worktrees.create({baseRef: "main", projectPath: repo});
    await writeFile(join(worktree.path, "dirty.txt"), "x\n");

    await worktrees.remove({projectPath: repo, worktree});

    expect(existsSync(worktree.path)).toBe(false);
    expect(await git(repo, "branch", "--list", worktree.branch)).toBe("");
    await expect(worktrees.remove({projectPath: repo, worktree})).resolves.toBeUndefined();
  });

  it("fails on an unknown base ref", async () => {
    const repo = await createRepo(tempDirs);
    const storage = await mkdtemp(join(tmpdir(), "supernova-worktrees-"));
    tempDirs.push(storage);

    await expect(new Worktrees(storage).create({baseRef: "nope", projectPath: repo})).rejects.toThrow(/Git command failed/);
  });
});
