import {execFile} from "node:child_process";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {Effect} from "effect";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {getWorkspaceChanges} from "@supernova/agent-runtime/layers/workspace/operations/changes/get-workspace-changes";
import {getWorkspaceDiffContents} from "@supernova/agent-runtime/layers/workspace/operations/changes/get-workspace-diff-contents";
import {listWorkspaceFiles} from "@supernova/agent-runtime/layers/workspace/operations/files/list-workspace-files";
import {readWorkspaceFile} from "@supernova/agent-runtime/layers/workspace/operations/files/read-workspace-file";

const exec = promisify(execFile);
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.result(effect));

let repo: string;
let plainFolder: string;
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
});

afterAll(async () => {
  await rm(repo, {force: true, recursive: true});
  await rm(plainFolder, {force: true, recursive: true});
});

describe("workspace git operations", () => {
  it("reports a plain folder as not a repository", async () => {
    const result = await run(listWorkspaceFiles(plainFolder));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(result.failure._tag).toBe("WorkspaceNotARepositoryError");
  });

  it("lists tracked and untracked files without ignored ones", async () => {
    const result = await run(listWorkspaceFiles(repo));
    expect(result._tag === "Success" && [...result.success.files].toSorted()).toEqual([".gitignore", "binary.bin", "src/a.ts", "src/b.ts", "src/c.ts", "src/new.ts"]);
  });

  it("reports uncommitted changes with status and line counts", async () => {
    const result = await run(getWorkspaceChanges(repo));
    expect(result._tag).toBe("Success");
    if (result._tag !== "Success") return;
    const byPath = new Map(result.success.uncommitted.map((entry) => [entry.path, entry]));
    expect(byPath.get("src/a.ts")).toEqual({additions: 1, deletions: 0, path: "src/a.ts", status: "modified"});
    expect(byPath.get("README.md")).toEqual({additions: 0, deletions: 1, path: "README.md", status: "deleted"});
    expect(byPath.get("src/new.ts")).toEqual({additions: 2, deletions: 0, path: "src/new.ts", status: "untracked"});
    expect(byPath.has("ignored.log")).toBe(false);
  });

  it.each([
    {expected: {newContents: "a\nb\nc\n", oldContents: "a\nb\n"}, name: "returns HEAD and working-tree sides for a tracked file", path: "src/a.ts"},
    {expected: {newContents: "x\ny\n", oldContents: ""}, name: "returns an empty old side for an untracked file", path: "src/new.ts"},
    {expected: {newContents: "", oldContents: "hi\n"}, name: "returns an empty new side for a deleted file", path: "README.md"},
  ])("$name", async ({expected, path}) => {
    const result = await run(getWorkspaceDiffContents({path, projectPath: repo}));
    expect(result._tag === "Success" && result.success).toEqual(expected);
  });

  it.each([
    {expected: {content: "a\nb\nc\n"}, name: "reads a text file", path: "src/a.ts"},
    {expected: {tag: "WorkspaceBinaryFileError"}, name: "refuses binary files", path: "binary.bin"},
    {expected: {tag: "WorkspaceFileNotFoundError"}, name: "refuses paths that escape the project", path: "../outside.txt"},
    {expected: {tag: "WorkspaceFileNotFoundError"}, name: "refuses missing files", path: "src/missing.ts"},
  ])("$name", async ({expected, path}) => {
    const result = await run(readWorkspaceFile({path, projectPath: repo}));
    if ("content" in expected) expect(result._tag === "Success" && result.success).toEqual(expected);
    else expect(result._tag === "Failure" && result.failure._tag).toBe(expected.tag);
  });
});
