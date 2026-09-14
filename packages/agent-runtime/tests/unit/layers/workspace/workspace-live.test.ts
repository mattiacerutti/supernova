import {execFile} from "node:child_process";
import {mkdir, mkdtemp, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {Effect} from "effect";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {getWorkspaceChanges} from "@supernova/agent-runtime/layers/workspace/operations/changes/get-workspace-changes";
import {getWorkspaceDiffContents} from "@supernova/agent-runtime/layers/workspace/operations/changes/get-workspace-diff-contents";
import {listWorkspaceRepositories} from "@supernova/agent-runtime/layers/workspace/operations/changes/list-workspace-repositories";
import {listWorkspaceFiles} from "@supernova/agent-runtime/layers/workspace/operations/files/list-workspace-files";
import {readWorkspaceFile} from "@supernova/agent-runtime/layers/workspace/operations/files/read-workspace-file";

const exec = promisify(execFile);
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.result(effect));

let repo: string;
let plainFolder: string;
let outsideRepo: string;
const commitIds: string[] = [];

async function git(...args: string[]): Promise<string> {
  const {stdout} = await exec("git", args, {
    cwd: repo,
    env: {...process.env, GIT_AUTHOR_NAME: "Ada", GIT_AUTHOR_EMAIL: "a@x", GIT_COMMITTER_NAME: "Ada", GIT_COMMITTER_EMAIL: "a@x"},
  });
  return stdout.trim();
}

async function commit(message: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(repo, path, ".."), {recursive: true});
    await writeFile(join(repo, path), content);
  }
  await git("add", "-A");
  await git("commit", "-q", "-m", message);
  commitIds.unshift(await git("rev-parse", "HEAD"));
}

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "supernova-workspace-"));
  plainFolder = await mkdtemp(join(tmpdir(), "supernova-plain-"));
  await git("init", "-q", "-b", "main");
  await commit("first", {"src/a.ts": "a\n", "README.md": "hi\n"});
  await commit("second", {"src/a.ts": "a\nb\n", "src/b.ts": "b\n"});
  await commit("third", {"src/c.ts": "c\n"});
  // Working tree: modify a tracked file, delete one, add an untracked one, and an ignored one.
  await writeFile(join(repo, "src/a.ts"), "a\nb\nc\n");
  await rm(join(repo, "README.md"));
  await writeFile(join(repo, "src/new.ts"), "x\ny\n");
  await writeFile(join(repo, ".gitignore"), "ignored.log\n");
  await writeFile(join(repo, "ignored.log"), "noise\n");
  await writeFile(join(repo, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  // A nested repository one level down, with its own committed and uncommitted files, plus a deeper one that must be ignored.
  await mkdir(join(repo, "nested"));
  await exec("git", ["init", "-q", "-b", "main"], {cwd: join(repo, "nested")});
  await writeFile(join(repo, "nested/n.ts"), "n\n");
  await exec("git", ["add", "-A"], {cwd: join(repo, "nested")});
  await exec("git", ["-c", "user.name=Ada", "-c", "user.email=a@x", "commit", "-q", "-m", "nested"], {cwd: join(repo, "nested")});
  await writeFile(join(repo, "nested/n.ts"), "n\nm\n");
  await mkdir(join(repo, "nested/deeper"));
  await exec("git", ["init", "-q"], {cwd: join(repo, "nested/deeper")});
  await writeFile(join(repo, "nested/deeper/d.ts"), "d\n");
  // A repository reachable only through a symlinked child, used to check that requests cannot follow it.
  outsideRepo = await mkdtemp(join(tmpdir(), "supernova-outside-"));
  await exec("git", ["init", "-q", "-b", "main"], {cwd: outsideRepo});
  await symlink(outsideRepo, join(repo, "linked"));
});

afterAll(async () => {
  await rm(repo, {force: true, recursive: true});
  await rm(plainFolder, {force: true, recursive: true});
  await rm(outsideRepo, {force: true, recursive: true});
});

describe("workspace git operations", () => {
  it("discovers the root repository and its immediate children only", async () => {
    const result = await run(listWorkspaceRepositories(repo));
    expect(result._tag === "Success" && result.success.repositories).toEqual([".", "nested"]);
    const plain = await run(listWorkspaceRepositories(plainFolder));
    expect(plain._tag === "Success" && plain.success.repositories).toEqual([]);
  });

  it.each([
    {name: "refuses repository roots with path segments", root: "../elsewhere"},
    {name: "refuses an empty repository root", root: ""},
    // A symlinked child is never discovered, so following one would read a repository outside the project.
    {name: "refuses a symlinked repository root", root: "linked"},
  ])("$name", async ({root}) => {
    const result = await run(getWorkspaceChanges({projectPath: repo, repositoryRoot: root}));
    expect(result._tag === "Failure" && result.failure._tag).toBe("WorkspaceGenericError");
  });

  it("does not read files outside the repository through a relative path", async () => {
    const result = await run(getWorkspaceDiffContents({path: "../../../../etc/hosts", projectPath: repo, repositoryRoot: "."}));
    expect(result._tag === "Success" && result.success).toEqual({newContents: "", oldContents: ""});
  });

  it("reports a plain folder as not a repository", async () => {
    const result = await run(listWorkspaceFiles(plainFolder));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(result.failure._tag).toBe("WorkspaceNotARepositoryError");
  });

  it("lists the files of every discovered repository, without ignored ones or deeper repositories", async () => {
    const result = await run(listWorkspaceFiles(repo));
    // Git tracks a symlink as a file, so it is listed; opening it is refused separately.
    expect(result._tag === "Success" && [...result.success.files].toSorted()).toEqual([
      ".gitignore",
      "binary.bin",
      "linked",
      "nested/n.ts",
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/new.ts",
    ]);
  });

  it("reports uncommitted changes with status and line counts", async () => {
    const result = await run(getWorkspaceChanges({projectPath: repo, repositoryRoot: "."}));
    expect(result._tag).toBe("Success");
    if (result._tag !== "Success") return;
    const byPath = new Map(result.success.uncommitted.map((entry) => [entry.path, entry]));
    expect(byPath.has("nested/")).toBe(false);
    expect([...byPath.keys()].some((path) => path.startsWith("nested/"))).toBe(false);
    expect(byPath.get("src/a.ts")).toEqual({additions: 1, deletions: 0, path: "src/a.ts", status: "modified"});
    expect(byPath.get("README.md")).toEqual({additions: 0, deletions: 1, path: "README.md", status: "deleted"});
    expect(byPath.get("src/new.ts")).toEqual({additions: 2, deletions: 0, path: "src/new.ts", status: "untracked"});
    expect(byPath.has("ignored.log")).toBe(false);
  });

  it("scopes changes to the selected nested repository", async () => {
    const result = await run(getWorkspaceChanges({projectPath: repo, repositoryRoot: "nested"}));
    expect(result._tag === "Success" && result.success.uncommitted).toEqual([{additions: 1, deletions: 0, path: "n.ts", status: "modified"}]);
    const diff = await run(getWorkspaceDiffContents({path: "n.ts", projectPath: repo, repositoryRoot: "nested"}));
    expect(diff._tag === "Success" && diff.success).toEqual({newContents: "n\nm\n", oldContents: "n\n"});
  });

  it.each([
    {expected: {newContents: "a\nb\nc\n", oldContents: "a\nb\n"}, name: "returns HEAD and working-tree sides for a tracked file", path: "src/a.ts"},
    {expected: {newContents: "x\ny\n", oldContents: ""}, name: "returns an empty old side for an untracked file", path: "src/new.ts"},
    {expected: {newContents: "", oldContents: "hi\n"}, name: "returns an empty new side for a deleted file", path: "README.md"},
  ])("$name", async ({expected, path}) => {
    const result = await run(getWorkspaceDiffContents({path, projectPath: repo, repositoryRoot: "."}));
    expect(result._tag === "Success" && result.success).toEqual(expected);
  });

  it.each([
    {expected: {content: "a\nb\nc\n"}, name: "reads a text file", path: "src/a.ts"},
    {expected: {tag: "WorkspaceBinaryFileError"}, name: "refuses binary files", path: "binary.bin"},
    {expected: {tag: "WorkspaceFileNotFoundError"}, name: "refuses paths that escape the project", path: "../outside.txt"},
    {expected: {tag: "WorkspaceFileNotFoundError"}, name: "refuses missing files", path: "src/missing.ts"},
    {expected: {tag: "WorkspaceFileNotFoundError"}, name: "refuses files reached through a symlink out of the project", path: "linked/HEAD"},
  ])("$name", async ({expected, path}) => {
    const result = await run(readWorkspaceFile({path, projectPath: repo}));
    if ("content" in expected) expect(result._tag === "Success" && result.success).toEqual(expected);
    else expect(result._tag === "Failure" && result.failure._tag).toBe(expected.tag);
  });
});
