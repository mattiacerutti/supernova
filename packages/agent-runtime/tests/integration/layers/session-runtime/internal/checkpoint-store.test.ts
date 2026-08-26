import {execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, mkdtempSync, rmSync} from "node:fs";
import {chmod, mkdir, readdir, readFile, readlink, realpath, rm, stat, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {Effect} from "effect";
import {afterEach, describe, expect, it} from "vitest";
import {CheckpointStore, makeCheckpointStoreLive} from "@supernova/agent-runtime/layers/session-runtime/internal/checkpoint-store";
import {checkpointRefName} from "@supernova/agent-runtime/layers/session-runtime/internal/shadow-repository";

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

async function createChildRepo(parent: string): Promise<string> {
  const child = join(parent, "child");
  await mkdir(child);
  await git(child, ["init"]);
  await git(child, ["config", "user.email", "test@example.com"]);
  await git(child, ["config", "user.name", "Test User"]);
  await writeFile(join(child, "child.txt"), "child\n");
  await git(child, ["add", "."]);
  await git(child, ["commit", "-m", "child"]);
  return child;
}

function runCheckpoint<A>(storageRoot: string, effect: Effect.Effect<A, never, CheckpointStore>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(makeCheckpointStoreLive(storageRoot))));
}

const CONCURRENCY_FIXTURE_FILES = 40;

/** Writes enough tracked content that a restore holds the worktree for a measurable window. */
async function writeConcurrencyFixture(repo: string, marker: string): Promise<void> {
  await Promise.all(
    Array.from({length: CONCURRENCY_FIXTURE_FILES}, (_unused, index) => writeFile(join(repo, `concurrent-${index}.txt`), `${marker}\n${`${marker} line ${index}\n`.repeat(512)}`))
  );
}

/** Returns the tree recorded for the project root repository in a checkpoint manifest. */
async function rootTreeId(storageRoot: string, projectRoot: string, checkpointId: string): Promise<string> {
  const manifestPath = join(storageRoot, "projects", hash(await realpath(projectRoot)), "manifests", hash(sessionId), `${hash(checkpointId)}.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  return manifest.repositories.find((repository: {relativeRoot: string}) => repository.relativeRoot === ".").treeId;
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
      yield* Effect.promise(() => store.restore({checkpointId, force: false, fromCheckpointId, projectRoot, sessionId}));
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
    const projectStorage = join(storageRoot, "projects", hash(canonicalRoot));
    const manifest = JSON.parse(await readFile(join(projectStorage, "manifests", hash(sessionId), `${hash("cp-1")}.json`), "utf8"));
    const shadowGitDir = join(projectStorage, "repositories", manifest.repositories[0].repositoryId, "git");

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

  it("restores tracked deletions, executable modes, symlinks, and file-directory transitions", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);
    await writeFile(join(repo, "script.sh"), "#!/bin/sh\necho before\n");
    await writeFile(join(repo, "shape"), "file before\n");
    await writeFile(join(repo, "target-before.txt"), "before\n");
    await writeFile(join(repo, "target-after.txt"), "after\n");
    await symlink("target-before.txt", join(repo, "link"));
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "tree fidelity"]);
    await capture(storageRoot, repo, "before");

    await rm(join(repo, "deleted.txt"));
    await chmod(join(repo, "script.sh"), 0o755);
    await rm(join(repo, "link"));
    await symlink("target-after.txt", join(repo, "link"));
    await rm(join(repo, "shape"));
    await mkdir(join(repo, "shape"));
    await writeFile(join(repo, "shape", "nested.txt"), "directory after\n");
    await capture(storageRoot, repo, "after");

    await restore(storageRoot, repo, "after", "before");

    await expect(readFile(join(repo, "deleted.txt"), "utf8")).resolves.toBe("delete me\n");
    expect((await stat(join(repo, "script.sh"))).mode & 0o111).toBe(0);
    await expect(readlink(join(repo, "link"))).resolves.toBe("target-before.txt");
    await expect(readFile(join(repo, "shape"), "utf8")).resolves.toBe("file before\n");

    await restore(storageRoot, repo, "before", "after");

    await expect(stat(join(repo, "deleted.txt"))).rejects.toThrow();
    expect((await stat(join(repo, "script.sh"))).mode & 0o111).not.toBe(0);
    await expect(readlink(join(repo, "link"))).resolves.toBe("target-after.txt");
    await expect(readFile(join(repo, "shape", "nested.txt"), "utf8")).resolves.toBe("directory after\n");
  });

  it("captures eligible untracked and flagged tracked files while preserving ignored and oversized untracked files", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    const boundaryUntracked = "c".repeat(2 * 1024 * 1024);
    const largeBefore = "a".repeat(2 * 1024 * 1024 + 1);
    const largeAfter = "b".repeat(2 * 1024 * 1024 + 1);
    tempDirs.push(repo, storageRoot);
    await writeFile(join(repo, "large-tracked.bin"), largeBefore);
    await writeFile(join(repo, "assumed.txt"), "assumed before\n");
    await writeFile(join(repo, "tracked.log"), "ignored but tracked before\n");
    await git(repo, ["add", "."]);
    await git(repo, ["add", "-f", "tracked.log"]);
    await git(repo, ["commit", "-m", "capture eligibility"]);
    await capture(storageRoot, repo, "before");

    await git(repo, ["update-index", "--skip-worktree", "tracked.txt"]);
    await git(repo, ["update-index", "--assume-unchanged", "assumed.txt"]);
    await writeFile(join(repo, "tracked.txt"), "skip-worktree after\n");
    await writeFile(join(repo, "assumed.txt"), "assume-unchanged after\n");
    await writeFile(join(repo, "large-tracked.bin"), largeAfter);
    await writeFile(join(repo, "tracked.log"), "ignored but tracked after\n");
    await writeFile(join(repo, "small-untracked.txt"), "captured\n");
    await writeFile(join(repo, "boundary-untracked.bin"), boundaryUntracked);
    await writeFile(join(repo, "large-untracked.bin"), largeAfter);
    await writeFile(join(repo, "ignored.log"), "ignored\n");
    await capture(storageRoot, repo, "after");

    await restore(storageRoot, repo, "after", "before");

    await expect(readFile(join(repo, "tracked.txt"), "utf8")).resolves.toBe("before\n");
    await expect(readFile(join(repo, "assumed.txt"), "utf8")).resolves.toBe("assumed before\n");
    await expect(readFile(join(repo, "large-tracked.bin"), "utf8")).resolves.toBe(largeBefore);
    await expect(readFile(join(repo, "tracked.log"), "utf8")).resolves.toBe("ignored but tracked before\n");
    await expect(stat(join(repo, "small-untracked.txt"))).rejects.toThrow();
    await expect(stat(join(repo, "boundary-untracked.bin"))).rejects.toThrow();
    await expect(readFile(join(repo, "large-untracked.bin"), "utf8")).resolves.toBe(largeAfter);
    await expect(readFile(join(repo, "ignored.log"), "utf8")).resolves.toBe("ignored\n");
    await expect(gitOutput(repo, ["ls-files", "-v", "tracked.txt"])).resolves.toMatch(/^S /);
    await expect(gitOutput(repo, ["ls-files", "-v", "assumed.txt"])).resolves.toMatch(/^[a-z] /);

    await restore(storageRoot, repo, "before", "after");

    await expect(readFile(join(repo, "tracked.txt"), "utf8")).resolves.toBe("skip-worktree after\n");
    await expect(readFile(join(repo, "assumed.txt"), "utf8")).resolves.toBe("assume-unchanged after\n");
    await expect(readFile(join(repo, "large-tracked.bin"), "utf8")).resolves.toBe(largeAfter);
    await expect(readFile(join(repo, "tracked.log"), "utf8")).resolves.toBe("ignored but tracked after\n");
    await expect(readFile(join(repo, "small-untracked.txt"), "utf8")).resolves.toBe("captured\n");
    await expect(readFile(join(repo, "boundary-untracked.bin"), "utf8")).resolves.toBe(boundaryUntracked);
  });

  it("removes refs from earlier repositories when a later repository capture fails", async () => {
    const repo = await createRepo();
    await createChildRepo(repo);
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);
    await capture(storageRoot, repo, "baseline");

    const projectStorage = join(storageRoot, "projects", hash(await realpath(repo)));
    const baselineManifest = JSON.parse(await readFile(join(projectStorage, "manifests", hash(sessionId), `${hash("baseline")}.json`), "utf8"));
    const rootState = baselineManifest.repositories.find((repository: {relativeRoot: string}) => repository.relativeRoot === ".");
    const childState = baselineManifest.repositories.find((repository: {relativeRoot: string}) => repository.relativeRoot === "child");
    const rootShadowGitDir = join(projectStorage, "repositories", rootState.repositoryId, "git");
    const childShadowGitDir = join(projectStorage, "repositories", childState.repositoryId, "git");
    await rm(childShadowGitDir, {force: true, recursive: true});
    await writeFile(childShadowGitDir, "not a repository\n");

    await expect(capture(storageRoot, repo, "incomplete")).rejects.toThrow();

    await expect(stat(join(projectStorage, "manifests", hash(sessionId), `${hash("incomplete")}.json`))).rejects.toThrow();
    await expect(gitOutput(repo, ["--git-dir", rootShadowGitDir, "rev-parse", "--verify", checkpointRefName(sessionId, "incomplete")])).rejects.toThrow();
  });

  it("rolls back earlier repositories when a later restore refuses to remove nested Git metadata", async () => {
    const repo = await createRepo();
    const child = await createChildRepo(repo);
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);
    await writeFile(join(child, "shape"), "file before\n");
    await git(child, ["add", "shape"]);
    await git(child, ["commit", "-m", "shape file"]);
    await capture(storageRoot, repo, "before");

    await writeFile(join(repo, "tracked.txt"), "after\n");
    await rm(join(child, "shape"));
    await mkdir(join(child, "shape"));
    await writeFile(join(child, "shape", "nested.txt"), "directory after\n");
    await capture(storageRoot, repo, "after");
    await mkdir(join(child, "shape", ".git"));

    await expect(restore(storageRoot, repo, "after", "before")).rejects.toThrow("Checkpoint restore would remove nested Git metadata.");
    await expect(readFile(join(repo, "tracked.txt"), "utf8")).resolves.toBe("after\n");
    await expect(readFile(join(child, "shape", "nested.txt"), "utf8")).resolves.toBe("directory after\n");
    expect((await stat(join(child, "shape", ".git"))).isDirectory()).toBe(true);
  });

  it("rejects corrupted manifests before mutating the worktree", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);
    await capture(storageRoot, repo, "before");
    await writeFile(join(repo, "tracked.txt"), "after\n");
    await capture(storageRoot, repo, "after");

    const manifestPath = join(storageRoot, "projects", hash(await realpath(repo)), "manifests", hash(sessionId), `${hash("before")}.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await writeFile(manifestPath, `${JSON.stringify({...manifest, sessionId: "another-session"})}\n`);

    await expect(restore(storageRoot, repo, "after", "before")).rejects.toThrow("Checkpoint manifest ownership is invalid.");
    await expect(readFile(join(repo, "tracked.txt"), "utf8")).resolves.toBe("after\n");
  });

  it("rejects missing checkpoint refs before mutating the worktree", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);
    await capture(storageRoot, repo, "before");
    await writeFile(join(repo, "tracked.txt"), "after\n");
    await capture(storageRoot, repo, "after");

    const projectStorage = join(storageRoot, "projects", hash(await realpath(repo)));
    const manifest = JSON.parse(await readFile(join(projectStorage, "manifests", hash(sessionId), `${hash("before")}.json`), "utf8"));
    const shadowGitDir = join(projectStorage, "repositories", manifest.repositories[0].repositoryId, "git");
    await git(repo, ["--git-dir", shadowGitDir, "update-ref", "-d", manifest.repositories[0].refName]);

    await expect(restore(storageRoot, repo, "after", "before")).rejects.toThrow();
    await expect(readFile(join(repo, "tracked.txt"), "utf8")).resolves.toBe("after\n");
  });

  it("deletes only refs and manifests owned by an archived session across all workspace repositories", async () => {
    const repo = await createRepo();
    await createChildRepo(repo);
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
    expect(ownedManifest.repositories.map((repository: {relativeRoot: string}) => repository.relativeRoot)).toEqual([".", "child"]);

    await runCheckpoint(
      storageRoot,
      Effect.gen(function* () {
        const store = yield* CheckpointStore;
        yield* Effect.promise(() => store.deleteSession({projectRoot: repo, sessionId}));
      })
    );

    await expect(stat(ownedManifestPath)).rejects.toThrow();
    expect((await stat(retainedManifestPath)).isFile()).toBe(true);
    for (const [index, ownedRepository] of ownedManifest.repositories.entries()) {
      const shadowGitDir = join(projectStorage, "repositories", ownedRepository.repositoryId, "git");
      await expect(gitOutput(repo, ["--git-dir", shadowGitDir, "rev-parse", "--verify", ownedRepository.refName])).rejects.toThrow();
      await expect(gitOutput(repo, ["--git-dir", shadowGitDir, "rev-parse", "--verify", retainedManifest.repositories[index].refName])).resolves.toHaveLength(40);
    }
  });

  it("keeps one repository identity across ordinary Git activity", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);

    await capture(storageRoot, repo, "first");
    // Branch switches, commits, and ref writes all touch .git metadata.
    await git(repo, ["checkout", "-b", "other"]);
    await writeFile(join(repo, "tracked.txt"), "committed on other\n");
    await git(repo, ["commit", "-am", "other"]);
    await git(repo, ["checkout", "-"]);
    await capture(storageRoot, repo, "second");

    const projectStorage = join(storageRoot, "projects", hash(await realpath(repo)));
    const [first, second] = await Promise.all(
      ["first", "second"].map(async (checkpointId) => JSON.parse(await readFile(join(projectStorage, "manifests", hash(sessionId), `${hash(checkpointId)}.json`), "utf8")))
    );

    expect(second.repositories[0].repositoryId).toBe(first.repositories[0].repositoryId);
    await expect(readdir(join(projectStorage, "repositories"))).resolves.toHaveLength(1);
  });

  it("pins the prune window in shadow repositories and leaves automatic Git maintenance enabled", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);

    await capture(storageRoot, repo, "cp-1");

    const projectStorage = join(storageRoot, "projects", hash(await realpath(repo)));
    const manifest = JSON.parse(await readFile(join(projectStorage, "manifests", hash(sessionId), `${hash("cp-1")}.json`), "utf8"));
    const shadowGitDir = join(projectStorage, "repositories", manifest.repositories[0].repositoryId, "git");

    // The prune window must come from the shadow repository, not the user's global config.
    await expect(gitOutput(repo, ["--git-dir", shadowGitDir, "config", "--local", "--get", "gc.pruneExpire"])).resolves.toBe("7.days");
    await expect(gitOutput(repo, ["--git-dir", shadowGitDir, "config", "--local", "--get", "gc.auto"])).rejects.toThrow();
    await expect(gitOutput(repo, ["--git-dir", shadowGitDir, "config", "--local", "--get", "core.fsmonitor"])).resolves.toBe("false");
  });

  it("keeps direct child repositories out of their parent snapshot", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);
    await createChildRepo(repo);

    await capture(storageRoot, repo, "cp-1");

    const projectStorage = join(storageRoot, "projects", hash(await realpath(repo)));
    const manifestPath = join(projectStorage, "manifests", hash(sessionId), `${hash("cp-1")}.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(manifest.repositories.map((repository: {relativeRoot: string}) => repository.relativeRoot)).toEqual([".", "child"]);
    const parentTree = manifest.repositories.find((repository: {relativeRoot: string}) => repository.relativeRoot === ".");
    const parentGitDir = join(projectStorage, "repositories", parentTree.repositoryId, "git");
    await expect(gitOutput(repo, ["--git-dir", parentGitDir, "ls-tree", "-r", "--name-only", parentTree.treeId])).resolves.not.toContain("child/");
  });

  it("captures a consistent workspace when a capture runs during a restore", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);
    await writeConcurrencyFixture(repo, "before");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "concurrency fixture"]);
    await capture(storageRoot, repo, "before");
    await writeConcurrencyFixture(repo, "after");
    await capture(storageRoot, repo, "after");

    const results = await runCheckpoint(
      storageRoot,
      Effect.gen(function* () {
        const store = yield* CheckpointStore;
        return yield* Effect.promise(() =>
          Promise.allSettled([
            store.restore({checkpointId: "before", force: false, fromCheckpointId: "after", projectRoot: repo, sessionId}),
            store.capture({checkpointId: "concurrent", projectRoot: repo, sessionId}),
          ])
        );
      })
    );

    expect(results.map(({status}) => status)).toEqual(["fulfilled", "fulfilled"]);
    const [beforeTree, afterTree, concurrentTree] = await Promise.all(["before", "after", "concurrent"].map((checkpointId) => rootTreeId(storageRoot, repo, checkpointId)));
    // The capture either precedes or follows the restore. A torn read would
    // record a tree matching neither checkpoint.
    expect([afterTree, beforeTree]).toContain(concurrentTree);
  });

  it("serializes concurrent restores instead of interleaving worktree mutations", async () => {
    const repo = await createRepo();
    const storageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
    tempDirs.push(repo, storageRoot);
    await writeConcurrencyFixture(repo, "before");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "concurrency fixture"]);
    await capture(storageRoot, repo, "before");
    await writeConcurrencyFixture(repo, "after");
    await capture(storageRoot, repo, "after");

    const results = await runCheckpoint(
      storageRoot,
      Effect.gen(function* () {
        const store = yield* CheckpointStore;
        const restoreToBefore = () => store.restore({checkpointId: "before", force: false, fromCheckpointId: "after", projectRoot: repo, sessionId});
        return yield* Effect.promise(() => Promise.allSettled([restoreToBefore(), restoreToBefore()]));
      })
    );

    // The second restore observes the completed first restore, so its conflict
    // check rejects instead of mutating a partially restored worktree.
    expect(results.filter(({status}) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({status}) => status === "rejected")).toHaveLength(1);

    await capture(storageRoot, repo, "verification");
    await expect(rootTreeId(storageRoot, repo, "verification")).resolves.toBe(await rootTreeId(storageRoot, repo, "before"));
  });
});
