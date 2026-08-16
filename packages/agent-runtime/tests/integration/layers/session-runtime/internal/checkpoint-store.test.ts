import {execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, mkdtempSync, rmSync} from "node:fs";
import {mkdir, readFile, realpath, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {Effect} from "effect";
import {afterEach, describe, expect, it} from "vitest";
import {CheckpointStore, makeCheckpointStoreLive} from "@supernova/agent-runtime/layers/session-runtime/internal/checkpoint-store";

const execFilePromise = promisify(execFile);
const sessionId = "test-session";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFilePromise("git", [...args], {cwd, encoding: "utf8"});
}

async function gitOutput(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFilePromise("git", [...args], {cwd, encoding: "utf8"});
  return result.stdout.trim();
}

async function createRepo(): Promise<string> {
  const repo = mkdtempSync(join(tmpdir(), "supernova-checkpoint-test-"));
  await git(repo, ["init"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Test User"]);
  await writeFile(join(repo, ".gitignore"), "*.log\n");
  await writeFile(join(repo, "tracked.txt"), "before\n");
  await writeFile(join(repo, "deleted.txt"), "delete me\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "initial"]);
  return repo;
}

function runCheckpoint<A>(storageRoot: string, effect: Effect.Effect<A, never, CheckpointStore>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(makeCheckpointStoreLive(storageRoot))));
}

function capture(storageRoot: string, projectRoot: string, checkpointId: string): Promise<void> {
  return runCheckpoint(
    storageRoot,
    Effect.gen(function* () {
      const store = yield* CheckpointStore;
      yield* Effect.promise(() => store.capture({checkpointId, projectRoot, sessionId}));
    })
  );
}

function restore(storageRoot: string, projectRoot: string, fromCheckpointId: string, checkpointId: string): Promise<void> {
  return runCheckpoint(
    storageRoot,
    Effect.gen(function* () {
      const store = yield* CheckpointStore;
      yield* Effect.promise(() => store.restore({checkpointId, fromCheckpointId, projectRoot, sessionId}));
    })
  );
}

describe("checkpoint store", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) rmSync(tempDirs.pop()!, {force: true, recursive: true});
  });

  it("publishes manifests and refs only in app-owned shadow repositories", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);

    await capture(storageRoot, repo, "cp-1");

    const canonicalRoot = await gitOutput(repo, ["rev-parse", "--show-toplevel"]);
    const gitDir = await gitOutput(repo, ["rev-parse", "--absolute-git-dir"]);
    const repositoryId = hash(`${canonicalRoot}\0${gitDir}`);
    const projectStorage = join(storageRoot, "projects", hash(canonicalRoot));
    const shadowGitDir = join(projectStorage, "repositories", repositoryId, "git");
    const manifest = JSON.parse(await readFile(join(projectStorage, "manifests", hash(sessionId), `${hash("cp-1")}.json`), "utf8"));

    expect(manifest).toMatchObject({checkpointId: "cp-1", projectRoot: canonicalRoot, sessionId, version: 1});
    expect(manifest.repositories).toHaveLength(1);
    await expect(gitOutput(repo, ["--git-dir", shadowGitDir, "rev-parse", `${manifest.repositories[0].refName}^{tree}`])).resolves.toBe(manifest.repositories[0].treeId);
    expect(existsSync(join(repo, ".git", "supernova"))).toBe(false);
    expect(existsSync(join(repo, ".git", "refs", "supernova"))).toBe(false);
  });

  it("captures an empty manifest for projects without Git repositories", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-nongit-"));
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(projectRoot, storageRoot);
    await mkdir(join(projectRoot, "nested"));

    await capture(storageRoot, projectRoot, "cp-1");

    const manifestPath = join(storageRoot, "projects", hash(await realpath(projectRoot)), "manifests", hash(sessionId), `${hash("cp-1")}.json`);
    await expect(readFile(manifestPath, "utf8").then(JSON.parse)).resolves.toMatchObject({repositories: []});
  });

  it("restores checkpoint deltas without moving HEAD or changing the user index", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);
    await writeFile(join(repo, "outside.txt"), "preserved\n");
    await capture(storageRoot, repo, "before");

    await writeFile(join(repo, "tracked.txt"), "after\n");
    await writeFile(join(repo, "created.txt"), "created\n");
    await capture(storageRoot, repo, "after");
    await writeFile(join(repo, "staged.txt"), "staged\n");
    await git(repo, ["add", "staged.txt"]);
    const head = await gitOutput(repo, ["rev-parse", "HEAD"]);
    const staged = await gitOutput(repo, ["diff", "--cached", "--name-only"]);

    await restore(storageRoot, repo, "after", "before");

    await expect(readFile(join(repo, "tracked.txt"), "utf8")).resolves.toBe("before\n");
    await expect(stat(join(repo, "created.txt"))).rejects.toThrow();
    await expect(readFile(join(repo, "outside.txt"), "utf8")).resolves.toBe("preserved\n");
    await expect(readFile(join(repo, "staged.txt"), "utf8")).resolves.toBe("staged\n");
    await expect(gitOutput(repo, ["rev-parse", "HEAD"])).resolves.toBe(head);
    await expect(gitOutput(repo, ["diff", "--cached", "--name-only"])).resolves.toBe(staged);
  });

  it("fails before mutation when an affected file changed after the current checkpoint", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);
    await capture(storageRoot, repo, "before");
    await writeFile(join(repo, "tracked.txt"), "after\n");
    await capture(storageRoot, repo, "after");
    await writeFile(join(repo, "tracked.txt"), "manual\n");

    await expect(restore(storageRoot, repo, "after", "before")).rejects.toThrow("Workspace files changed after the current checkpoint.");
    await expect(readFile(join(repo, "tracked.txt"), "utf8")).resolves.toBe("manual\n");
  });

  it("deletes only refs and manifests owned by an archived session", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);
    const otherSessionId = "other-session";

    await runCheckpoint(
      storageRoot,
      Effect.gen(function* () {
        const store = yield* CheckpointStore;
        yield* Effect.promise(() => store.capture({checkpointId: "owned", projectRoot: repo, sessionId}));
        yield* Effect.promise(() => store.capture({checkpointId: "retained", projectRoot: repo, sessionId: otherSessionId}));
      })
    );

    const projectStorage = join(storageRoot, "projects", hash(await realpath(repo)));
    const ownedManifestPath = join(projectStorage, "manifests", hash(sessionId), `${hash("owned")}.json`);
    const retainedManifestPath = join(projectStorage, "manifests", hash(otherSessionId), `${hash("retained")}.json`);
    const ownedManifest = JSON.parse(await readFile(ownedManifestPath, "utf8"));
    const retainedManifest = JSON.parse(await readFile(retainedManifestPath, "utf8"));
    const shadowGitDir = join(projectStorage, "repositories", ownedManifest.repositories[0].repositoryId, "git");

    await runCheckpoint(
      storageRoot,
      Effect.gen(function* () {
        const store = yield* CheckpointStore;
        yield* Effect.promise(() => store.deleteSession({projectRoot: repo, sessionId}));
      })
    );

    await expect(stat(ownedManifestPath)).rejects.toThrow();
    expect((await stat(retainedManifestPath)).isFile()).toBe(true);
    await expect(gitOutput(repo, ["--git-dir", shadowGitDir, "rev-parse", "--verify", ownedManifest.repositories[0].refName])).rejects.toThrow();
    await expect(gitOutput(repo, ["--git-dir", shadowGitDir, "rev-parse", "--verify", retainedManifest.repositories[0].refName])).resolves.toHaveLength(40);
  });

  it("keeps direct child repositories out of their parent snapshot", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    const child = join(repo, "child");
    tempDirs.push(repo, storageRoot);
    await mkdir(child);
    await git(child, ["init"]);
    await git(child, ["config", "user.email", "test@example.com"]);
    await git(child, ["config", "user.name", "Test User"]);
    await writeFile(join(child, "child.txt"), "child\n");
    await git(child, ["add", "."]);
    await git(child, ["commit", "-m", "child"]);

    await capture(storageRoot, repo, "cp-1");

    const projectStorage = join(storageRoot, "projects", hash(await realpath(repo)));
    const manifestPath = join(projectStorage, "manifests", hash(sessionId), `${hash("cp-1")}.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(manifest.repositories.map((repository: {relativeRoot: string}) => repository.relativeRoot)).toEqual([".", "child"]);
    const parentTree = manifest.repositories.find((repository: {relativeRoot: string}) => repository.relativeRoot === ".");
    const parentGitDir = join(projectStorage, "repositories", parentTree.repositoryId, "git");
    await expect(gitOutput(repo, ["--git-dir", parentGitDir, "ls-tree", "-r", "--name-only", parentTree.treeId])).resolves.not.toContain("child/");
  });
});
