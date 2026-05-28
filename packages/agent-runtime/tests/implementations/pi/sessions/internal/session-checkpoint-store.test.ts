import {execFile} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {Effect} from "effect";
import {afterEach, describe, expect, it} from "vitest";
import {SessionCheckpointStore, SessionCheckpointStoreLive} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/session-checkpoint-store";

const execFilePromise = promisify(execFile);
const sessionId = "test-session";

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

function runCheckpoint<A>(effect: Effect.Effect<A, never, SessionCheckpointStore>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(SessionCheckpointStoreLive)));
}

describe("Pi session checkpoint store", () => {
  const repos: string[] = [];

  afterEach(() => {
    while (repos.length > 0) rmSync(repos.pop()!, {force: true, recursive: true});
  });

  it("creates repo-local checkpoint refs", async () => {
    const repo = await createRepo();
    repos.push(repo);

    const created = await runCheckpoint(
      Effect.gen(function* () {
        const store = yield* SessionCheckpointStore;
        return yield* Effect.promise(() => store.create({checkpointId: "cp-1", cwd: repo, sessionId}));
      })
    );

    expect(created).toBe(true);
    await expect(gitOutput(repo, ["rev-parse", "--verify", `refs/supernova/checkpoints/${sessionId}/cp-1`])).resolves.toHaveLength(40);
  });

  it("returns false for non-git directories", async () => {
    const directory = mkdtempSync(join(tmpdir(), "supernova-checkpoint-nongit-"));
    repos.push(directory);
    await mkdir(join(directory, "nested"));

    const created = await runCheckpoint(
      Effect.gen(function* () {
        const store = yield* SessionCheckpointStore;
        return yield* Effect.promise(() => store.create({checkpointId: "cp-1", cwd: directory, sessionId}));
      })
    );

    expect(created).toBe(false);
  });

  it("restores the full checkpoint tree with pi-rewind safe clean", async () => {
    const repo = await createRepo();
    repos.push(repo);
    await writeFile(join(repo, "preexisting.txt"), "keep me\n");

    await runCheckpoint(
      Effect.gen(function* () {
        const store = yield* SessionCheckpointStore;
        yield* Effect.promise(() => store.create({checkpointId: "cp-restore", cwd: repo, sessionId}));
      })
    );

    await writeFile(join(repo, "tracked.txt"), "after\n");
    await writeFile(join(repo, "created.txt"), "delete me\n");
    await writeFile(join(repo, "ignored.log"), "ignored\n");
    await rm(join(repo, "deleted.txt"));

    await runCheckpoint(
      Effect.gen(function* () {
        const store = yield* SessionCheckpointStore;
        yield* Effect.promise(() => store.restore({checkpointId: "cp-restore", cwd: repo, sessionId}));
      })
    );

    await expect(readFile(join(repo, "tracked.txt"), "utf8")).resolves.toBe("before\n");
    await expect(readFile(join(repo, "deleted.txt"), "utf8")).resolves.toBe("delete me\n");
    await expect(readFile(join(repo, "preexisting.txt"), "utf8")).resolves.toBe("keep me\n");
    await expect(readFile(join(repo, "created.txt"), "utf8")).rejects.toThrow();
    await expect(readFile(join(repo, "ignored.log"), "utf8")).resolves.toBe("ignored\n");
  });

  it("does not mutate the user index while creating a checkpoint", async () => {
    const repo = await createRepo();
    repos.push(repo);
    await writeFile(join(repo, "tracked.txt"), "staged checkpoint\n");
    await git(repo, ["add", "tracked.txt"]);
    await writeFile(join(repo, "tracked.txt"), "unstaged worktree\n");
    const statusBefore = await gitOutput(repo, ["status", "--porcelain"]);

    await runCheckpoint(
      Effect.gen(function* () {
        const store = yield* SessionCheckpointStore;
        yield* Effect.promise(() => store.create({checkpointId: "cp-index", cwd: repo, sessionId}));
      })
    );

    await expect(gitOutput(repo, ["status", "--porcelain"])).resolves.toBe(statusBefore);
  });

  it("restores staged state", async () => {
    const repo = await createRepo();
    repos.push(repo);
    await writeFile(join(repo, "tracked.txt"), "staged checkpoint\n");
    await git(repo, ["add", "tracked.txt"]);

    await runCheckpoint(
      Effect.gen(function* () {
        const store = yield* SessionCheckpointStore;
        yield* Effect.promise(() => store.create({checkpointId: "cp-staged", cwd: repo, sessionId}));
      })
    );

    await writeFile(join(repo, "tracked.txt"), "after checkpoint\n");
    await git(repo, ["add", "tracked.txt"]);
    await runCheckpoint(
      Effect.gen(function* () {
        const store = yield* SessionCheckpointStore;
        yield* Effect.promise(() => store.restore({checkpointId: "cp-staged", cwd: repo, sessionId}));
      })
    );

    await expect(readFile(join(repo, "tracked.txt"), "utf8")).resolves.toBe("staged checkpoint\n");
    await expect(gitOutput(repo, ["diff", "--cached", "--", "tracked.txt"])).resolves.toContain("staged checkpoint");
  });

  it("blocks cross-branch restores", async () => {
    const repo = await createRepo();
    repos.push(repo);
    await runCheckpoint(
      Effect.gen(function* () {
        const store = yield* SessionCheckpointStore;
        yield* Effect.promise(() => store.create({checkpointId: "cp-main", cwd: repo, sessionId}));
      })
    );
    await git(repo, ["checkout", "-b", "feature"]);

    await expect(
      runCheckpoint(
        Effect.gen(function* () {
          const store = yield* SessionCheckpointStore;
          yield* Effect.promise(() => store.restore({checkpointId: "cp-main", cwd: repo, sessionId}));
        })
      )
    ).rejects.toThrow("Checkpoint was created on");
  });
});
