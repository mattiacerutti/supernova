import {execFile} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {Effect, Fiber, Stream} from "effect";
import type {AssistantMessage} from "@earendil-works/pi-ai";
import {afterEach, describe, expect, it} from "vitest";
import type {CheckpointStoreShape} from "@supernova/agent-runtime/layers/session-runtime/internal/checkpoint-store";
import {SessionRuntimeService} from "@supernova/agent-runtime/services/session-runtime-service";
import type {SessionRuntimeServiceShape} from "@supernova/agent-runtime/services/session-runtime-service";
import {SessionsService} from "@supernova/agent-runtime/services/sessions-service";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import {createPiTestRuntime, fauxAssistantMessage, selectedModelReference, selectedPiModel, waitUntil} from "@tests/support/layers/pi-session-test-utils";

const execFilePromise = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFilePromise("git", [...args], {cwd, encoding: "utf8"});
}

async function gitOutput(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFilePromise("git", [...args], {cwd, encoding: "utf8"});
  return result.stdout.trim();
}

async function initializeGitRepository(repositoryPath: string, fileName: string, contents = "initial\n"): Promise<void> {
  await git(repositoryPath, ["init"]);
  await git(repositoryPath, ["config", "user.email", "test@example.com"]);
  await git(repositoryPath, ["config", "user.name", "Test User"]);
  await writeFile(join(repositoryPath, fileName), contents);
  await git(repositoryPath, ["add", "."]);
  await git(repositoryPath, ["commit", "-m", "initial"]);
}

async function createGitProject(): Promise<string> {
  const projectPath = mkdtempSync(join(tmpdir(), "supernova-checkpoint-navigation-"));
  await initializeGitRepository(projectPath, "file.txt");
  return projectPath;
}

async function createGitProjectWithChild(): Promise<{readonly childPath: string; readonly projectPath: string}> {
  const projectPath = await createGitProject();
  const childPath = join(projectPath, "child");
  await writeFile(join(projectPath, ".gitignore"), "child/\n");
  await git(projectPath, ["add", ".gitignore"]);
  await git(projectPath, ["commit", "-m", "ignore child repository"]);
  await mkdir(childPath);
  await initializeGitRepository(childPath, "child.txt");
  return {childPath, projectPath};
}

async function createProject(): Promise<string> {
  const projectPath = mkdtempSync(join(tmpdir(), "supernova-checkpoint-navigation-"));
  await writeFile(join(projectPath, "file.txt"), "initial\n");
  return projectPath;
}

const unavailableChildRepositoryCases = [
  {
    expectedContents: undefined,
    name: "removed",
    mutate: (childPath: string) => rm(childPath, {force: true, recursive: true}),
  },
  {
    expectedContents: "child two\n",
    name: "replaced",
    mutate: async (childPath: string) => {
      await rm(childPath, {force: true, recursive: true});
      await mkdir(childPath);
      // Matching the current checkpoint tree ensures replacement detection does not rely on a file conflict.
      await initializeGitRepository(childPath, "child.txt", "child two\n");
    },
  },
] as const;

function snapshotEvents(events: readonly SessionStreamEvent[]): Array<Extract<SessionStreamEvent, {type: "session.snapshot"}>> {
  return events.filter((event): event is Extract<SessionStreamEvent, {type: "session.snapshot"}> => event.type === "session.snapshot");
}

function errorEvents(events: readonly SessionStreamEvent[]): Array<Extract<SessionStreamEvent, {type: "session.error"}>> {
  return events.filter((event): event is Extract<SessionStreamEvent, {type: "session.error"}> => event.type === "session.error");
}

function assistantWithUsage(text: string, totalTokens: number, stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage {
  return {
    ...fauxAssistantMessage(text, {stopReason}),
    api: selectedPiModel.api,
    model: selectedPiModel.id,
    provider: selectedPiModel.provider,
    usage: {cacheRead: 0, cacheWrite: 0, cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0}, input: totalTokens, output: 0, totalTokens},
  };
}

async function runSessionCommand(input: {
  readonly pi: Awaited<ReturnType<typeof createPiTestRuntime>>;
  readonly run: (sessionRuntime: SessionRuntimeServiceShape) => Effect.Effect<void>;
}): Promise<SessionStreamEvent[]> {
  const events: SessionStreamEvent[] = [];
  const watcher = input.pi.runtime.runFork(
    Effect.gen(function* () {
      const sessionRuntime = yield* SessionRuntimeService;
      yield* Stream.runForEach(sessionRuntime.watchEvents(), (event) => Effect.sync(() => events.push(event)));
    })
  );
  try {
    await waitUntil(() => {
      if (!events.some((event) => event.type === "connected")) throw new Error("Stream did not connect.");
    });
    await input.pi.runWithSessionRuntime(
      Effect.gen(function* () {
        const sessionRuntime = yield* SessionRuntimeService;
        yield* input.run(sessionRuntime);
      })
    );
    await waitUntil(() => {
      if (!events.some((event) => event.type === "session.snapshot" || event.type === "session.error")) throw new Error("Session command did not publish a result.");
    });
    return events;
  } finally {
    await input.pi.runtime.runPromise(Fiber.interrupt(watcher).pipe(Effect.ignore));
  }
}

async function runRejectedSessionCommand(input: {
  readonly pi: Awaited<ReturnType<typeof createPiTestRuntime>>;
  readonly run: (sessionRuntime: SessionRuntimeServiceShape) => Effect.Effect<void>;
}): Promise<{readonly cause: unknown; readonly events: readonly SessionStreamEvent[]}> {
  const events: SessionStreamEvent[] = [];
  const watcher = input.pi.runtime.runFork(
    Effect.gen(function* () {
      const sessionRuntime = yield* SessionRuntimeService;
      yield* Stream.runForEach(sessionRuntime.watchEvents(), (event) => Effect.sync(() => events.push(event)));
    })
  );
  try {
    await waitUntil(() => {
      if (!events.some((event) => event.type === "connected")) throw new Error("Stream did not connect.");
    });

    let cause: unknown;
    try {
      await input.pi.runWithSessionRuntime(
        Effect.gen(function* () {
          const sessionRuntime = yield* SessionRuntimeService;
          yield* input.run(sessionRuntime);
        })
      );
    } catch (error) {
      cause = error;
    }

    return {cause, events};
  } finally {
    await input.pi.runtime.runPromise(Fiber.interrupt(watcher).pipe(Effect.ignore));
  }
}

describe("checkpoint navigation", () => {
  const runtimes: Array<{unregister: () => void}> = [];
  const tempDirs: string[] = [];

  afterEach(() => {
    while (runtimes.length > 0) runtimes.pop()?.unregister();
    while (tempDirs.length > 0) rmSync(tempDirs.pop()!, {force: true, recursive: true});
  });

  it("reverts directly before a selected turn and restores selected and later file changes", async () => {
    const projectPath = await createGitProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "one\n");
        return fauxAssistantMessage("one");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "two\n");
        return fauxAssistantMessage("two");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "three\n");
        return fauxAssistantMessage("three");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    const secondEvents = await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "three", modelReference: selectedModelReference, sessionId: info.id});
    const secondTurnId = snapshotEvents(secondEvents).at(-1)!.session.turns.at(-1)!.id;

    const revertEvents = await runSessionCommand({
      pi,
      run: (sessionRuntime) => sessionRuntime.revertToMessage({sessionId: info.id, turnId: secondTurnId}),
    });

    expect(
      snapshotEvents(revertEvents)
        .at(-1)
        ?.session.turns.map((turn) => turn.userMessage.contentParts[0])
    ).toEqual([{text: "one", type: "text"}]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("one\n");
  });

  it("preserves manual file changes made between turns when undoing the later turn", async () => {
    const projectPath = await createGitProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "one\n");
        return fauxAssistantMessage("one");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "two\n");
        await writeFile(join(projectPath, "agent-two.txt"), "agent two\n");
        return fauxAssistantMessage("two");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await writeFile(join(projectPath, "manual.txt"), "manual between turns\n");
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});

    const undoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});

    expect(errorEvents(undoEvents)).toEqual([]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("one\n");
    await expect(readFile(join(projectPath, "manual.txt"), "utf8")).resolves.toBe("manual between turns\n");
    await expect(readFile(join(projectPath, "agent-two.txt"), "utf8")).rejects.toThrow();
  });

  it("undoes a turn after uncommitted changes are carried onto a new branch", async () => {
    const projectPath = await createGitProject();
    tempDirs.push(projectPath);
    await git(projectPath, ["branch", "-M", "main"]);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "one\n");
        return fauxAssistantMessage("one");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "two\n");
        await writeFile(join(projectPath, "agent-two.txt"), "agent two\n");
        return fauxAssistantMessage("two");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await writeFile(join(projectPath, "manual.txt"), "manual between turns\n");
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    await git(projectPath, ["checkout", "-b", "second"]);

    const undoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});

    expect(errorEvents(undoEvents)).toEqual([]);
    await expect(gitOutput(projectPath, ["branch", "--show-current"])).resolves.toBe("second");
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("one\n");
    await expect(readFile(join(projectPath, "manual.txt"), "utf8")).resolves.toBe("manual between turns\n");
    await expect(readFile(join(projectPath, "agent-two.txt"), "utf8")).rejects.toThrow();
  });

  it("keeps checkpoint navigation revisions monotonic after a manual abort", async () => {
    const projectPath = await createProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([fauxAssistantMessage("one"), fauxAssistantMessage("two")]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    const secondEvents = await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    const secondTurnId = snapshotEvents(secondEvents).at(-1)!.session.turns.at(-1)!.id;

    let providerSignal: AbortSignal | undefined;
    let releaseProvider: (() => void) | undefined;
    const providerStarted = new Promise<void>((resolve) => {
      pi.faux.setResponses([
        async (_context, options) => {
          providerSignal = options?.signal;
          resolve();
          await new Promise<void>((release) => {
            releaseProvider = release;
          });
          return fauxAssistantMessage("three");
        },
      ]);
    });
    const events: SessionStreamEvent[] = [];
    const watcher = pi.runtime.runFork(
      Effect.gen(function* () {
        const sessionRuntime = yield* SessionRuntimeService;
        yield* Stream.runForEach(sessionRuntime.watchEvents(), (event) => Effect.sync(() => events.push(event)));
      })
    );

    try {
      await waitUntil(() => {
        if (!events.some((event) => event.type === "connected")) throw new Error("Stream did not connect.");
      });

      await pi.runWithSessionRuntime(
        Effect.gen(function* () {
          const sessionRuntime = yield* SessionRuntimeService;
          yield* sessionRuntime.sendMessage({contentParts: [{text: "three", type: "text"}], modelReference: selectedModelReference, sessionId: info.id});
        })
      );
      await providerStarted;
      await waitUntil(() => {
        if (!events.some((event) => event.type === "session.agent.started")) throw new Error("Session agent did not start.");
      });

      const abortRun = pi.runWithSessionRuntime(
        Effect.gen(function* () {
          const sessionRuntime = yield* SessionRuntimeService;
          yield* sessionRuntime.abortSession(info.id);
        })
      );
      await waitUntil(() => {
        if (!providerSignal?.aborted) throw new Error("Provider request was not aborted.");
      });
      releaseProvider?.();
      await abortRun;
      await waitUntil(() => {
        if (!events.some((event) => event.type === "session.snapshot")) throw new Error("Aborted session did not publish a snapshot.");
      });

      const maxRevisionBeforeRevert = Math.max(...events.flatMap((event) => ("revision" in event ? [event.revision] : [])));

      await pi.runWithSessionRuntime(
        Effect.gen(function* () {
          const sessionRuntime = yield* SessionRuntimeService;
          yield* sessionRuntime.revertToMessage({sessionId: info.id, turnId: secondTurnId});
        })
      );
      await waitUntil(() => {
        const latestSnapshot = snapshotEvents(events).at(-1);
        if (!latestSnapshot || latestSnapshot.revision <= maxRevisionBeforeRevert) throw new Error("Revert snapshot did not advance the session revision.");
      });

      const latestSnapshot = snapshotEvents(events).at(-1)!;
      expect(latestSnapshot.revision).toBeGreaterThan(maxRevisionBeforeRevert);
      expect(latestSnapshot.session.turns.map((turn) => turn.userMessage.contentParts[0])).toEqual([{text: "one", type: "text"}]);
      expect(latestSnapshot.session.undoneTurns.map((turn) => turn.userMessage.contentParts[0])).toEqual([
        {text: "two", type: "text"},
        {text: "three", type: "text"},
      ]);
    } finally {
      releaseProvider?.();
      await pi.runtime.runPromise(Fiber.interrupt(watcher).pipe(Effect.ignore));
    }
  });

  it("undoes and redoes one checkpoint while restoring files in both directions", async () => {
    const projectPath = await createGitProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "one\n");
        return fauxAssistantMessage("one");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "two\n");
        return fauxAssistantMessage("two");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});

    const undoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});
    expect(
      snapshotEvents(undoEvents)
        .at(-1)
        ?.session.turns.map((turn) => turn.userMessage.contentParts[0])
    ).toEqual([{text: "one", type: "text"}]);
    expect(
      snapshotEvents(undoEvents)
        .at(-1)
        ?.session.undoneTurns.map((turn) => turn.userMessage.contentParts[0])
    ).toEqual([{text: "two", type: "text"}]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("one\n");

    const redoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.redoCheckpoint({sessionId: info.id})});
    expect(errorEvents(redoEvents)).toEqual([]);
    expect(
      snapshotEvents(redoEvents)
        .at(-1)
        ?.session.turns.map((turn) => turn.userMessage.contentParts[0])
    ).toEqual([
      {text: "one", type: "text"},
      {text: "two", type: "text"},
    ]);
    expect(snapshotEvents(redoEvents).at(-1)?.session.undoneTurns).toEqual([]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("two\n");
  });

  it("preserves git history and user files outside the checkpoint diff during undo and redo", async () => {
    const projectPath = await createGitProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "one\n");
        await git(projectPath, ["add", "file.txt"]);
        await git(projectPath, ["commit", "-m", "agent one"]);
        return fauxAssistantMessage("one");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "two\n");
        await git(projectPath, ["add", "file.txt"]);
        await git(projectPath, ["commit", "-m", "agent two"]);
        return fauxAssistantMessage("two");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    const headAfterSecondTurn = await gitOutput(projectPath, ["rev-parse", "HEAD"]);
    await writeFile(join(projectPath, "user-staged.txt"), "keep staged\n");
    await git(projectPath, ["add", "user-staged.txt"]);
    await writeFile(join(projectPath, "user-untracked.txt"), "keep untracked\n");

    const undoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});

    expect(errorEvents(undoEvents)).toEqual([]);
    await expect(gitOutput(projectPath, ["rev-parse", "HEAD"])).resolves.toBe(headAfterSecondTurn);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("one\n");
    await expect(readFile(join(projectPath, "user-staged.txt"), "utf8")).resolves.toBe("keep staged\n");
    await expect(readFile(join(projectPath, "user-untracked.txt"), "utf8")).resolves.toBe("keep untracked\n");
    await expect(gitOutput(projectPath, ["diff", "--cached", "--name-only"])).resolves.toContain("user-staged.txt");

    await writeFile(join(projectPath, "redo-staged.txt"), "keep through redo\n");
    await git(projectPath, ["add", "redo-staged.txt"]);
    const redoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.redoCheckpoint({sessionId: info.id})});

    expect(errorEvents(redoEvents)).toEqual([]);
    await expect(gitOutput(projectPath, ["rev-parse", "HEAD"])).resolves.toBe(headAfterSecondTurn);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("two\n");
    await expect(readFile(join(projectPath, "user-staged.txt"), "utf8")).resolves.toBe("keep staged\n");
    await expect(readFile(join(projectPath, "user-untracked.txt"), "utf8")).resolves.toBe("keep untracked\n");
    await expect(readFile(join(projectPath, "redo-staged.txt"), "utf8")).resolves.toBe("keep through redo\n");
    await expect(gitOutput(projectPath, ["diff", "--cached", "--name-only"])).resolves.toContain("user-staged.txt");
    await expect(gitOutput(projectPath, ["diff", "--cached", "--name-only"])).resolves.toContain("redo-staged.txt");
  });

  it("undoes and redoes sibling repositories in a non-Git workspace without touching loose root files", async () => {
    const projectPath = mkdtempSync(join(tmpdir(), "supernova-checkpoint-workspace-"));
    const firstRepository = join(projectPath, "first");
    const secondRepository = join(projectPath, "second");
    tempDirs.push(projectPath);
    await mkdir(firstRepository);
    await mkdir(secondRepository);
    await initializeGitRepository(firstRepository, "first.txt");
    await initializeGitRepository(secondRepository, "second.txt");
    await writeFile(join(projectPath, "loose.txt"), "initial loose\n");

    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(firstRepository, "first.txt"), "first one\n");
        await writeFile(join(secondRepository, "second.txt"), "second one\n");
        await writeFile(join(projectPath, "loose.txt"), "loose one\n");
        return fauxAssistantMessage("one");
      },
      async () => {
        await writeFile(join(firstRepository, "first.txt"), "first two\n");
        await writeFile(join(secondRepository, "second.txt"), "second two\n");
        await writeFile(join(projectPath, "loose.txt"), "loose two\n");
        return fauxAssistantMessage("two");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});

    const undoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});

    expect(errorEvents(undoEvents)).toEqual([]);
    await expect(readFile(join(firstRepository, "first.txt"), "utf8")).resolves.toBe("first one\n");
    await expect(readFile(join(secondRepository, "second.txt"), "utf8")).resolves.toBe("second one\n");
    await expect(readFile(join(projectPath, "loose.txt"), "utf8")).resolves.toBe("loose two\n");

    const redoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.redoCheckpoint({sessionId: info.id})});

    expect(errorEvents(redoEvents)).toEqual([]);
    await expect(readFile(join(firstRepository, "first.txt"), "utf8")).resolves.toBe("first two\n");
    await expect(readFile(join(secondRepository, "second.txt"), "utf8")).resolves.toBe("second two\n");
    await expect(readFile(join(projectPath, "loose.txt"), "utf8")).resolves.toBe("loose two\n");
  });

  it("undoes and redoes changes across root and direct child repositories without touching independent Git state", async () => {
    const {childPath, projectPath} = await createGitProjectWithChild();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "root one\n");
        await writeFile(join(childPath, "child.txt"), "child one\n");
        return fauxAssistantMessage("one");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "root two\n");
        await writeFile(join(projectPath, "root-agent.txt"), "root agent\n");
        await writeFile(join(childPath, "child.txt"), "child two\n");
        await writeFile(join(childPath, "child-agent.txt"), "child agent\n");
        return fauxAssistantMessage("two");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await writeFile(join(projectPath, "root-manual.txt"), "root manual\n");
    await writeFile(join(childPath, "child-manual.txt"), "child manual\n");
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});

    const rootHead = await gitOutput(projectPath, ["rev-parse", "HEAD"]);
    const childHead = await gitOutput(childPath, ["rev-parse", "HEAD"]);
    await writeFile(join(projectPath, "root-staged.txt"), "root staged\n");
    await git(projectPath, ["add", "root-staged.txt"]);
    await writeFile(join(childPath, "child-staged.txt"), "child staged\n");
    await git(childPath, ["add", "child-staged.txt"]);

    const undoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});

    expect(errorEvents(undoEvents)).toEqual([]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("root one\n");
    await expect(readFile(join(childPath, "child.txt"), "utf8")).resolves.toBe("child one\n");
    await expect(readFile(join(projectPath, "root-agent.txt"), "utf8")).rejects.toThrow();
    await expect(readFile(join(childPath, "child-agent.txt"), "utf8")).rejects.toThrow();
    await expect(readFile(join(projectPath, "root-manual.txt"), "utf8")).resolves.toBe("root manual\n");
    await expect(readFile(join(childPath, "child-manual.txt"), "utf8")).resolves.toBe("child manual\n");
    await expect(gitOutput(projectPath, ["rev-parse", "HEAD"])).resolves.toBe(rootHead);
    await expect(gitOutput(childPath, ["rev-parse", "HEAD"])).resolves.toBe(childHead);
    await expect(gitOutput(projectPath, ["diff", "--cached", "--name-only"])).resolves.toContain("root-staged.txt");
    await expect(gitOutput(childPath, ["diff", "--cached", "--name-only"])).resolves.toContain("child-staged.txt");

    const redoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.redoCheckpoint({sessionId: info.id})});

    expect(errorEvents(redoEvents)).toEqual([]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("root two\n");
    await expect(readFile(join(childPath, "child.txt"), "utf8")).resolves.toBe("child two\n");
    await expect(readFile(join(projectPath, "root-agent.txt"), "utf8")).resolves.toBe("root agent\n");
    await expect(readFile(join(childPath, "child-agent.txt"), "utf8")).resolves.toBe("child agent\n");
    await expect(readFile(join(projectPath, "root-manual.txt"), "utf8")).resolves.toBe("root manual\n");
    await expect(readFile(join(childPath, "child-manual.txt"), "utf8")).resolves.toBe("child manual\n");
    await expect(gitOutput(projectPath, ["rev-parse", "HEAD"])).resolves.toBe(rootHead);
    await expect(gitOutput(childPath, ["rev-parse", "HEAD"])).resolves.toBe(childHead);
    await expect(gitOutput(projectPath, ["diff", "--cached", "--name-only"])).resolves.toContain("root-staged.txt");
    await expect(gitOutput(childPath, ["diff", "--cached", "--name-only"])).resolves.toContain("child-staged.txt");
  });

  it("rejects multi-repository undo before mutating any repository or session state when a child has conflicting changes", async () => {
    const {childPath, projectPath} = await createGitProjectWithChild();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "root one\n");
        await writeFile(join(childPath, "child.txt"), "child one\n");
        return fauxAssistantMessage("one");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "root two\n");
        await writeFile(join(childPath, "child.txt"), "child two\n");
        return fauxAssistantMessage("two");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    await writeFile(join(childPath, "child.txt"), "manual conflict\n");

    const {cause, events} = await runRejectedSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});
    const loaded = await pi.runWithSessions(
      Effect.gen(function* () {
        const sessions = yield* SessionsService;
        return yield* sessions.get(info.id);
      })
    );

    expect(cause).toMatchObject({message: "Failed to restore workspace checkpoint."});
    expect(errorEvents(events)).toEqual([]);
    expect(snapshotEvents(events)).toEqual([]);
    expect(loaded.turns.map((turn) => turn.userMessage.contentParts[0])).toEqual([
      {text: "one", type: "text"},
      {text: "two", type: "text"},
    ]);
    expect(loaded.undoneTurns).toEqual([]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("root two\n");
    await expect(readFile(join(childPath, "child.txt"), "utf8")).resolves.toBe("manual conflict\n");
  });

  it("preserves a direct child repository created during a turn when undoing and redoing its parent changes", async () => {
    const projectPath = await createGitProject();
    const childPath = join(projectPath, "child");
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "one\n");
        return fauxAssistantMessage("one");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "two\n");
        await mkdir(childPath);
        await git(childPath, ["init"]);
        await git(childPath, ["config", "user.email", "test@example.com"]);
        await git(childPath, ["config", "user.name", "Test User"]);
        await writeFile(join(childPath, "child.txt"), "created by turn\n");
        await git(childPath, ["add", "."]);
        await git(childPath, ["commit", "-m", "created by turn"]);
        return fauxAssistantMessage("two");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    const childHead = await gitOutput(childPath, ["rev-parse", "HEAD"]);

    const undoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});

    expect(errorEvents(undoEvents)).toEqual([]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("one\n");
    await expect(readFile(join(childPath, "child.txt"), "utf8")).resolves.toBe("created by turn\n");
    await expect(gitOutput(childPath, ["rev-parse", "HEAD"])).resolves.toBe(childHead);

    await writeFile(join(childPath, "child.txt"), "manual after undo\n");
    const rejectedRedo = await runRejectedSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.redoCheckpoint({sessionId: info.id})});
    expect(rejectedRedo.cause).toMatchObject({message: "Failed to restore workspace checkpoint."});
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("one\n");
    await expect(readFile(join(childPath, "child.txt"), "utf8")).resolves.toBe("manual after undo\n");

    await writeFile(join(childPath, "child.txt"), "created by turn\n");
    const redoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.redoCheckpoint({sessionId: info.id})});

    expect(errorEvents(redoEvents)).toEqual([]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("two\n");
    await expect(readFile(join(childPath, "child.txt"), "utf8")).resolves.toBe("created by turn\n");
    await expect(gitOutput(childPath, ["rev-parse", "HEAD"])).resolves.toBe(childHead);
  });

  it.each(unavailableChildRepositoryCases)(
    "rejects undo without partially restoring the parent when a checkpoint child repository is $name",
    async ({expectedContents, mutate}) => {
      const {childPath, projectPath} = await createGitProjectWithChild();
      tempDirs.push(projectPath);
      const pi = await createPiTestRuntime();
      runtimes.push(pi);
      const {info} = pi.createSession(projectPath);
      pi.faux.setResponses([
        async () => {
          await writeFile(join(projectPath, "file.txt"), "root one\n");
          await writeFile(join(childPath, "child.txt"), "child one\n");
          return fauxAssistantMessage("one");
        },
        async () => {
          await writeFile(join(projectPath, "file.txt"), "root two\n");
          await writeFile(join(childPath, "child.txt"), "child two\n");
          return fauxAssistantMessage("two");
        },
      ]);

      await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
      await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
      await mutate(childPath);

      const {cause, events} = await runRejectedSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});
      const loaded = await pi.runWithSessions(
        Effect.gen(function* () {
          const sessions = yield* SessionsService;
          return yield* sessions.get(info.id);
        })
      );

      expect(cause).toMatchObject({message: "Failed to restore workspace checkpoint."});
      expect(errorEvents(events)).toEqual([]);
      expect(snapshotEvents(events)).toEqual([]);
      expect(loaded.turns).toHaveLength(2);
      expect(loaded.undoneTurns).toEqual([]);
      await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("root two\n");
      if (expectedContents === undefined) await expect(readFile(join(childPath, "child.txt"), "utf8")).rejects.toThrow();
      else await expect(readFile(join(childPath, "child.txt"), "utf8")).resolves.toBe(expectedContents);
    }
  );

  it("does not touch git stash entries during checkpoint undo", async () => {
    const projectPath = await createGitProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "one\n");
        return fauxAssistantMessage("one");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "two\n");
        return fauxAssistantMessage("two");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    await writeFile(join(projectPath, "stashed-only.txt"), "stash me\n");
    await git(projectPath, ["stash", "push", "--include-untracked", "-m", "manual stash", "--", "stashed-only.txt"]);

    const undoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});

    expect(errorEvents(undoEvents)).toEqual([]);
    await expect(gitOutput(projectPath, ["stash", "list"])).resolves.toContain("manual stash");
    await expect(gitOutput(projectPath, ["stash", "show", "--include-untracked", "--name-only", "stash@{0}"])).resolves.toContain("stashed-only.txt");
    await expect(readFile(join(projectPath, "stashed-only.txt"), "utf8")).rejects.toThrow();
  });

  it("reverts forward to selected undone turns", async () => {
    const projectPath = await createGitProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "one\n");
        return fauxAssistantMessage("one");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "two\n");
        return fauxAssistantMessage("two");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "three\n");
        return fauxAssistantMessage("three");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    const secondEvents = await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    const thirdEvents = await pi.sendMessage({message: "three", modelReference: selectedModelReference, sessionId: info.id});
    const secondTurnId = snapshotEvents(secondEvents).at(-1)!.session.turns.at(-1)!.id;
    const thirdTurnId = snapshotEvents(thirdEvents).at(-1)!.session.turns.at(-1)!.id;

    await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});
    await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});

    const restoreSecondEvents = await runSessionCommand({
      pi,
      run: (sessionRuntime) => sessionRuntime.revertToMessage({sessionId: info.id, turnId: secondTurnId}),
    });

    expect(
      snapshotEvents(restoreSecondEvents)
        .at(-1)
        ?.session.turns.map((turn) => turn.userMessage.contentParts[0])
    ).toEqual([
      {text: "one", type: "text"},
      {text: "two", type: "text"},
    ]);
    expect(
      snapshotEvents(restoreSecondEvents)
        .at(-1)
        ?.session.undoneTurns.map((turn) => turn.userMessage.contentParts[0])
    ).toEqual([{text: "three", type: "text"}]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("two\n");

    const restoreThirdEvents = await runSessionCommand({
      pi,
      run: (sessionRuntime) => sessionRuntime.revertToMessage({sessionId: info.id, turnId: thirdTurnId}),
    });

    expect(
      snapshotEvents(restoreThirdEvents)
        .at(-1)
        ?.session.turns.map((turn) => turn.userMessage.contentParts[0])
    ).toEqual([
      {text: "one", type: "text"},
      {text: "two", type: "text"},
      {text: "three", type: "text"},
    ]);
    expect(snapshotEvents(restoreThirdEvents).at(-1)?.session.undoneTurns).toEqual([]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("three\n");
  });

  it("publishes the restored checkpoint model when reverting backward and forward", async () => {
    const projectPath = await createProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    const highModel = selectedModelReference;
    const offModel = {...selectedModelReference, thinkingLevel: "off"};
    pi.faux.setResponses([fauxAssistantMessage("one"), fauxAssistantMessage("two")]);

    const firstEvents = await pi.sendMessage({message: "one", modelReference: highModel, sessionId: info.id});
    const secondEvents = await pi.sendMessage({message: "two", modelReference: offModel, sessionId: info.id});
    const firstTurnId = snapshotEvents(firstEvents).at(-1)!.session.turns.at(-1)!.id;
    const secondTurnId = snapshotEvents(secondEvents).at(-1)!.session.turns.at(-1)!.id;

    const revertFirstEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.revertToMessage({sessionId: info.id, turnId: firstTurnId})});
    expect(snapshotEvents(revertFirstEvents).at(-1)?.session.modelReference).toEqual(highModel);

    const restoreSecondEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.revertToMessage({sessionId: info.id, turnId: secondTurnId})});
    expect(snapshotEvents(restoreSecondEvents).at(-1)?.session.modelReference).toEqual(offModel);
  });

  it("keeps valid post-compaction usage when navigating to an aborted turn", async () => {
    const projectPath = await createProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info, manager} = pi.createSession(projectPath);
    pi.appendConversation(manager, {requestText: "Older request", assistantText: "Older response."});
    pi.appendConversation(manager, {requestText: "x".repeat(selectedPiModel.contextWindow * 4), assistantText: "Large response."});
    pi.faux.setResponses([fauxAssistantMessage("Compacted summary.")]);

    await runSessionCommand({
      pi,
      run: (sessionRuntime) => sessionRuntime.compactSession({modelReference: selectedModelReference, sessionId: info.id}),
    });

    pi.faux.setResponses([assistantWithUsage("Valid response.", 25_000), assistantWithUsage("Aborted response.", 0, "aborted")]);
    const validEvents = await pi.sendMessage({message: "valid", modelReference: selectedModelReference, sessionId: info.id});
    const abortedEvents = await pi.sendMessage({message: "abort", modelReference: selectedModelReference, sessionId: info.id});
    const validContext = snapshotEvents(validEvents).at(-1)?.session.context.usedTokens;
    const abortedContext = snapshotEvents(abortedEvents).at(-1)?.session.context.usedTokens;

    if (validContext === null || validContext === undefined || abortedContext === null || abortedContext === undefined) {
      throw new Error("Expected checkpoint snapshots to retain measurable context usage.");
    }
    expect(validContext).toBeGreaterThan(0);
    expect(abortedContext).toBeGreaterThan(validContext);

    await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});
    const redoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.redoCheckpoint({sessionId: info.id})});

    expect(snapshotEvents(redoEvents).at(-1)?.session.context.usedTokens).toBe(abortedContext);
  });

  it("rebuilds provider context from the visible branch after undo", async () => {
    const projectPath = await createProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    let providerUserTexts: string[] | undefined;
    pi.faux.setResponses([
      fauxAssistantMessage("one"),
      fauxAssistantMessage("two"),
      (context) => {
        providerUserTexts = context.messages
          .filter((message) => message.role === "user")
          .flatMap((message) => {
            if (typeof message.content === "string") return [message.content];
            return message.content.flatMap((part) => (part.type === "text" ? [part.text] : []));
          });
        return fauxAssistantMessage("branch");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});
    const branchEvents = await pi.sendMessage({message: "branch", modelReference: selectedModelReference, sessionId: info.id});

    expect(providerUserTexts).toEqual(["one", "branch"]);
    expect(
      snapshotEvents(branchEvents)
        .at(-1)
        ?.session.turns.map((turn) => turn.userMessage.contentParts[0])
    ).toEqual([
      {text: "one", type: "text"},
      {text: "branch", type: "text"},
    ]);
  });

  it("clears redo turns as soon as a replacement message is accepted", async () => {
    const projectPath = await createProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([fauxAssistantMessage("one"), fauxAssistantMessage("two")]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});

    let releaseProvider: (() => void) | undefined;
    const providerStarted = new Promise<void>((resolve) => {
      pi.faux.setResponses([
        async () => {
          resolve();
          await new Promise<void>((release) => {
            releaseProvider = release;
          });
          return fauxAssistantMessage("branch");
        },
      ]);
    });

    await pi.runWithSessionRuntime(
      Effect.gen(function* () {
        const sessionRuntime = yield* SessionRuntimeService;
        yield* sessionRuntime.sendMessage({contentParts: [{text: "branch", type: "text"}], modelReference: selectedModelReference, sessionId: info.id});
      })
    );
    await providerStarted;

    try {
      const loadedWhileStreaming = await pi.runWithSessions(
        Effect.gen(function* () {
          const sessions = yield* SessionsService;
          return yield* sessions.get(info.id);
        })
      );

      expect(loadedWhileStreaming.undoneTurns).toEqual([]);
    } finally {
      releaseProvider?.();
    }

    await waitUntil(async () => {
      const loaded = await pi.runWithSessions(
        Effect.gen(function* () {
          const sessions = yield* SessionsService;
          return yield* sessions.get(info.id);
        })
      );
      expect(loaded.turns.map((turn) => turn.userMessage.contentParts[0])).toEqual([
        {text: "one", type: "text"},
        {text: "branch", type: "text"},
      ]);
      expect(loaded.undoneTurns).toEqual([]);
    });
  });

  it("preserves the redo path and skips provider work when before-turn capture fails", async () => {
    let rejectCapture = false;
    const checkpointStore: CheckpointStoreShape = {
      capture: async () => {
        if (rejectCapture) throw new Error("Sensitive Git failure");
      },
      deleteSession: async () => undefined,
      restore: async () => undefined,
    };
    const pi = await createPiTestRuntime({checkpointStore});
    runtimes.push(pi);
    const {info} = pi.createSession();
    pi.faux.setResponses([fauxAssistantMessage("one"), fauxAssistantMessage("two"), fauxAssistantMessage("must not run")]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});
    rejectCapture = true;

    await expect(pi.sendMessage({message: "replacement", modelReference: selectedModelReference, sessionId: info.id})).rejects.toThrow(
      "Failed to capture workspace checkpoint."
    );
    const loadedAfterFailure = await pi.runWithSessions(
      Effect.gen(function* () {
        const sessions = yield* SessionsService;
        return yield* sessions.get(info.id);
      })
    );

    expect(loadedAfterFailure.turns.map((turn) => turn.userMessage.contentParts[0])).toEqual([{text: "one", type: "text"}]);
    expect(loadedAfterFailure.undoneTurns.map((turn) => turn.userMessage.contentParts[0])).toEqual([{text: "two", type: "text"}]);
    expect(pi.faux.state.callCount).toBe(2);

    rejectCapture = false;
    const redoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.redoCheckpoint({sessionId: info.id})});
    expect(snapshotEvents(redoEvents).at(-1)?.session.turns.map((turn) => turn.userMessage.contentParts[0])).toEqual([
      {text: "one", type: "text"},
      {text: "two", type: "text"},
    ]);
  });

  it("does not redo after a new branch diverges from an undone checkpoint", async () => {
    const projectPath = await createGitProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "one\n");
        return fauxAssistantMessage("one");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "two\n");
        return fauxAssistantMessage("two");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "branch\n");
        return fauxAssistantMessage("branch");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});
    await pi.sendMessage({message: "branch", modelReference: selectedModelReference, sessionId: info.id});

    const {cause, events: redoEvents} = await runRejectedSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.redoCheckpoint({sessionId: info.id})});

    expect(cause).toMatchObject({message: "No checkpoint is available to redo."});
    expect(errorEvents(redoEvents)).toEqual([]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("branch\n");
  });

  it("loads the persisted checkpoint cursor after refresh", async () => {
    const projectPath = await createProject();
    const sessionDir = mkdtempSync(join(tmpdir(), "supernova-checkpoint-session-"));
    tempDirs.push(projectPath, sessionDir);
    const pi = await createPiTestRuntime({reopenManagers: true, sessionDir});
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([fauxAssistantMessage("one"), fauxAssistantMessage("two")]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});

    const loaded = await pi.runWithSessions(
      Effect.gen(function* () {
        const sessions = yield* SessionsService;
        return yield* sessions.get(info.id);
      })
    );

    expect(loaded.turns.map((turn) => turn.userMessage.contentParts[0])).toEqual([{text: "one", type: "text"}]);
    expect(loaded.undoneTurns.map((turn) => turn.userMessage.contentParts[0])).toEqual([{text: "two", type: "text"}]);
  });

  it("undoes and redoes chat turns without restoring files outside a git repository", async () => {
    const projectPath = await createProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "one\n");
        return fauxAssistantMessage("one");
      },
      async () => {
        await writeFile(join(projectPath, "file.txt"), "two\n");
        return fauxAssistantMessage("two");
      },
    ]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});

    const undoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});

    expect(errorEvents(undoEvents)).toEqual([]);
    expect(
      snapshotEvents(undoEvents)
        .at(-1)
        ?.session.turns.map((turn) => turn.userMessage.contentParts[0])
    ).toEqual([{text: "one", type: "text"}]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("two\n");

    const redoEvents = await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.redoCheckpoint({sessionId: info.id})});

    expect(errorEvents(redoEvents)).toEqual([]);
    expect(
      snapshotEvents(redoEvents)
        .at(-1)
        ?.session.turns.map((turn) => turn.userMessage.contentParts[0])
    ).toEqual([
      {text: "one", type: "text"},
      {text: "two", type: "text"},
    ]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("two\n");
  });

  it("reverts directly before a selected chat turn outside a git repository", async () => {
    const projectPath = await createProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([fauxAssistantMessage("one"), fauxAssistantMessage("two"), fauxAssistantMessage("three")]);

    await pi.sendMessage({message: "one", modelReference: selectedModelReference, sessionId: info.id});
    const secondEvents = await pi.sendMessage({message: "two", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "three", modelReference: selectedModelReference, sessionId: info.id});
    const secondTurnId = snapshotEvents(secondEvents).at(-1)!.session.turns.at(-1)!.id;

    const revertEvents = await runSessionCommand({
      pi,
      run: (sessionRuntime) => sessionRuntime.revertToMessage({sessionId: info.id, turnId: secondTurnId}),
    });

    expect(errorEvents(revertEvents)).toEqual([]);
    expect(
      snapshotEvents(revertEvents)
        .at(-1)
        ?.session.turns.map((turn) => turn.userMessage.contentParts[0])
    ).toEqual([{text: "one", type: "text"}]);
  });
});
