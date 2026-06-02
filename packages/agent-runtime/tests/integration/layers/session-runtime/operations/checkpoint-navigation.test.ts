import {execFile} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import {readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {Effect, Fiber, Stream} from "effect";
import {afterEach, describe, expect, it} from "vitest";
import {SessionRuntimeService} from "@supernova/agent-runtime/services/session-runtime-service";
import type {SessionRuntimeServiceShape} from "@supernova/agent-runtime/services/session-runtime-service";
import {SessionsService} from "@supernova/agent-runtime/services/sessions-service";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import {createPiTestRuntime, fauxAssistantMessage, selectedModelReference, waitUntil} from "@tests/support/layers/pi-session-test-utils";

const execFilePromise = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFilePromise("git", [...args], {cwd, encoding: "utf8"});
}

async function createGitProject(): Promise<string> {
  const projectPath = mkdtempSync(join(tmpdir(), "supernova-checkpoint-navigation-"));
  await git(projectPath, ["init"]);
  await git(projectPath, ["config", "user.email", "test@example.com"]);
  await git(projectPath, ["config", "user.name", "Test User"]);
  await writeFile(join(projectPath, "file.txt"), "initial\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  return projectPath;
}

async function createProject(): Promise<string> {
  const projectPath = mkdtempSync(join(tmpdir(), "supernova-checkpoint-navigation-"));
  await writeFile(join(projectPath, "file.txt"), "initial\n");
  return projectPath;
}

function snapshotEvents(events: readonly SessionStreamEvent[]): Array<Extract<SessionStreamEvent, {type: "session.snapshot"}>> {
  return events.filter((event): event is Extract<SessionStreamEvent, {type: "session.snapshot"}> => event.type === "session.snapshot");
}

function errorEvents(events: readonly SessionStreamEvent[]): Array<Extract<SessionStreamEvent, {type: "session.error"}>> {
  return events.filter((event): event is Extract<SessionStreamEvent, {type: "session.error"}> => event.type === "session.error");
}

async function runSessionCommand(input: {
  readonly pi: ReturnType<typeof createPiTestRuntime>;
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
  readonly pi: ReturnType<typeof createPiTestRuntime>;
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
    const pi = createPiTestRuntime();
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

    await pi.sendMessage({message: "one", model: selectedModelReference, sessionId: info.id});
    const secondEvents = await pi.sendMessage({message: "two", model: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "three", model: selectedModelReference, sessionId: info.id});
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

  it("undoes and redoes one checkpoint while restoring files in both directions", async () => {
    const projectPath = await createGitProject();
    tempDirs.push(projectPath);
    const pi = createPiTestRuntime();
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

    await pi.sendMessage({message: "one", model: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", model: selectedModelReference, sessionId: info.id});

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

  it("reverts forward to selected undone turns", async () => {
    const projectPath = await createGitProject();
    tempDirs.push(projectPath);
    const pi = createPiTestRuntime();
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

    await pi.sendMessage({message: "one", model: selectedModelReference, sessionId: info.id});
    const secondEvents = await pi.sendMessage({message: "two", model: selectedModelReference, sessionId: info.id});
    const thirdEvents = await pi.sendMessage({message: "three", model: selectedModelReference, sessionId: info.id});
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

  it("does not redo after a new branch diverges from an undone checkpoint", async () => {
    const projectPath = await createGitProject();
    tempDirs.push(projectPath);
    const pi = createPiTestRuntime();
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

    await pi.sendMessage({message: "one", model: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", model: selectedModelReference, sessionId: info.id});
    await runSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.undoCheckpoint({sessionId: info.id})});
    await pi.sendMessage({message: "branch", model: selectedModelReference, sessionId: info.id});

    const {cause, events: redoEvents} = await runRejectedSessionCommand({pi, run: (sessionRuntime) => sessionRuntime.redoCheckpoint({sessionId: info.id})});

    expect(cause).toMatchObject({message: "No checkpoint is available to redo."});
    expect(errorEvents(redoEvents)).toEqual([]);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("branch\n");
  });

  it("loads the persisted checkpoint cursor after refresh", async () => {
    const projectPath = await createProject();
    const sessionDir = mkdtempSync(join(tmpdir(), "supernova-checkpoint-session-"));
    tempDirs.push(projectPath, sessionDir);
    const pi = createPiTestRuntime({reopenManagers: true, sessionDir});
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([fauxAssistantMessage("one"), fauxAssistantMessage("two")]);

    await pi.sendMessage({message: "one", model: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", model: selectedModelReference, sessionId: info.id});
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
    const pi = createPiTestRuntime();
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

    await pi.sendMessage({message: "one", model: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "two", model: selectedModelReference, sessionId: info.id});

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
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession(projectPath);
    pi.faux.setResponses([fauxAssistantMessage("one"), fauxAssistantMessage("two"), fauxAssistantMessage("three")]);

    await pi.sendMessage({message: "one", model: selectedModelReference, sessionId: info.id});
    const secondEvents = await pi.sendMessage({message: "two", model: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "three", model: selectedModelReference, sessionId: info.id});
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
