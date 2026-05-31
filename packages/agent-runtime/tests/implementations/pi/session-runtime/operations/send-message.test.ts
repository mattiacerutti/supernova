import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {Effect, Fiber, Stream} from "effect";
import type {AssistantMessage} from "@earendil-works/pi-ai";
import {mkdtempSync, rmSync} from "node:fs";
import {readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {SessionRuntimeService} from "@supernova/agent-runtime/services/session-runtime/session-runtime-service";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import {
  createPiTestRuntime,
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  imageAttachment,
  selectedModelReference,
  selectedPiModel,
  waitUntil,
} from "@tests/implementations/pi/pi-session-test-utils";

const execFilePromise = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFilePromise("git", [...args], {cwd, encoding: "utf8"});
}

async function gitOutput(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFilePromise("git", [...args], {cwd, encoding: "utf8"});
  return result.stdout.trim();
}

async function createGitProject(): Promise<string> {
  const projectPath = mkdtempSync(join(tmpdir(), "supernova-send-message-git-"));
  await git(projectPath, ["init"]);
  await git(projectPath, ["config", "user.email", "test@example.com"]);
  await git(projectPath, ["config", "user.name", "Test User"]);
  await writeFile(join(projectPath, "file.txt"), "before\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  return projectPath;
}

function isSnapshotEvent(event: SessionStreamEvent): event is Extract<SessionStreamEvent, {type: "session.snapshot"}> {
  return event.type === "session.snapshot";
}

function snapshotEvents(events: readonly SessionStreamEvent[]): Array<Extract<SessionStreamEvent, {type: "session.snapshot"}>> {
  return events.filter(isSnapshotEvent);
}

function isTurnEvent(event: SessionStreamEvent): event is Extract<SessionStreamEvent, {type: "session.turn"}> {
  return event.type === "session.turn";
}

function turnEvents(events: readonly SessionStreamEvent[]): Array<Extract<SessionStreamEvent, {type: "session.turn"}>> {
  return events.filter(isTurnEvent);
}

function assistantWithUsage(text: string, totalTokens: number): AssistantMessage {
  return {
    ...fauxAssistantMessage(text),
    api: selectedPiModel.api,
    model: selectedPiModel.id,
    provider: selectedPiModel.provider,
    usage: {cacheRead: 0, cacheWrite: 0, cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0}, input: totalTokens, output: 0, totalTokens},
  };
}

describe("sending messages through Pi sessions", () => {
  const runtimes: Array<{unregister: () => void}> = [];
  const tempDirs: string[] = [];

  afterEach(() => {
    while (runtimes.length > 0) runtimes.pop()?.unregister();
    while (tempDirs.length > 0) rmSync(tempDirs.pop()!, {force: true, recursive: true});
  });

  it("publishes session lifecycle, live turn, and final session snapshots", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info, manager} = pi.createSession();
    pi.appendConversation(manager);
    pi.faux.setResponses([fauxAssistantMessage([fauxThinking("Checking the workspace"), fauxText("Done.")])]);

    const events = await pi.sendMessage({message: "Fix it", model: selectedModelReference, sessionId: info.id});

    expect(manager.buildSessionContext()).toMatchObject({model: {modelId: "claude-sonnet", provider: "anthropic"}, thinkingLevel: "high"});
    expect(events.find((event) => event.type === "session.agent.started")).toMatchObject({sessionId: info.id, type: "session.agent.started"});
    expect(snapshotEvents(events).every((event) => event.session.turns.length === 2)).toBe(true);
    expect(events.find((event) => event.type === "session.turn")).toMatchObject({
      turn: {status: "streaming", userMessage: {contentParts: [{text: "Fix it", type: "text"}]}},
      type: "session.turn",
    });
    const finalSnapshot = snapshotEvents(events).at(-1);
    expect(finalSnapshot).toMatchObject({
      session: {
        turns: [
          {events: [{content: "Existing response", type: "assistant"}], userMessage: {contentParts: [{text: "Existing request", type: "text"}]}},
          {
            events: [
              {content: "Checking the workspace", type: "reasoning"},
              {content: "Done.", type: "assistant"},
            ],
            userMessage: {contentParts: [{text: "Fix it", type: "text"}]},
          },
        ],
      },
      type: "session.snapshot",
    });
  });

  it("sends authored text and images to the provider while displaying authored content parts", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession();
    const contentParts = [
      {text: "Review ", type: "text" as const},
      {id: "ref-1", kind: "file" as const, name: "file.ts", type: "reference" as const, value: "@src/file.ts"},
      imageAttachment,
    ];
    let providerUserContent: unknown;
    pi.faux.setResponses([
      (context) => {
        providerUserContent = context.messages.find((message) => message.role === "user")?.content;
        return fauxAssistantMessage("Reviewed.");
      },
    ]);

    const events = await pi.sendMessage({contentParts, model: selectedModelReference, sessionId: info.id});

    expect(providerUserContent).toEqual([
      {text: "Review @src/file.ts", type: "text"},
      {data: "aW1hZ2UtYnl0ZXM=", mimeType: "image/png", type: "image"},
    ]);
    expect(snapshotEvents(events).at(-1)).toMatchObject({
      session: {
        turns: [
          {
            events: [{content: "Reviewed.", type: "assistant"}],
            userMessage: {
              contentParts: [
                {text: "Review ", type: "text"},
                {id: "ref-1", kind: "file", value: "@src/file.ts"},
                {contentBase64: "aW1hZ2UtYnl0ZXM=", id: "image-1"},
              ],
            },
          },
        ],
      },
      type: "session.snapshot",
    });
  });

  it("streams pending and completed auto-compaction as part of the live and final turn snapshots", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info, manager} = pi.createSession();
    pi.appendConversation(manager, {requestText: "x".repeat(selectedPiModel.contextWindow * 4), assistantText: "Old response."});
    pi.faux.setResponses([fauxAssistantMessage("Done."), fauxAssistantMessage("Compacted summary."), fauxAssistantMessage("Compacted summary.")]);

    const events = await pi.sendMessage({message: "Continue", model: selectedModelReference, sessionId: info.id});
    const liveCompactionEvents = events.filter(isTurnEvent).flatMap((event) => event.turn.events.filter((turnEvent) => turnEvent.type === "compaction"));

    expect(liveCompactionEvents.map((event) => event.status)).toEqual(expect.arrayContaining(["pending", "completed"]));
    expect(liveCompactionEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({status: "pending", type: "compaction"}),
        expect.objectContaining({status: "completed", summary: "Compacted summary.", type: "compaction"}),
      ])
    );
    expect(events.find((event) => event.type === "session.compaction.ended")).toMatchObject({type: "session.compaction.ended"});
  });

  it("keeps pre-prompt compaction in the submitted turn", async () => {
    const pi = createPiTestRuntime({settings: {compaction: {enabled: true, reserveTokens: 1000}}});
    runtimes.push(pi);
    const {info, manager} = pi.createSession();
    manager.appendCustomEntry("supernova.user-message-content-parts", {contentParts: [{text: "Large previous request", type: "text"}]});
    manager.appendMessage({content: [{text: "Large previous request", type: "text"}], role: "user", timestamp: 1});
    manager.appendMessage(assistantWithUsage("Large previous response", selectedPiModel.contextWindow - 500));
    pi.faux.setResponses([fauxAssistantMessage("Pre-prompt compacted summary."), fauxAssistantMessage("Response after pre-prompt compaction.")]);

    const events = await pi.sendMessage({message: "Continue after pre-prompt compaction", model: selectedModelReference, sessionId: info.id});
    const liveTurn = turnEvents(events)
      .map((event) => event.turn)
      .find((turn) => turn?.events.some((turnEvent) => turnEvent.type === "assistant" && turnEvent.content === "Response after pre-prompt compaction."));
    const pendingCompactionTurn = turnEvents(events)
      .map((event) => event.turn)
      .find((turn) => turn?.events.some((turnEvent) => turnEvent.type === "compaction" && turnEvent.status === "pending"));

    expect(events.find((event) => event.type === "session.compaction.ended")).toMatchObject({type: "session.compaction.ended"});
    expect(pendingCompactionTurn).toMatchObject({
      userMessage: {contentParts: [{text: "Continue after pre-prompt compaction", type: "text"}]},
      events: expect.arrayContaining([expect.objectContaining({status: "pending", type: "compaction"})]),
    });
    expect(liveTurn).toMatchObject({
      userMessage: {contentParts: [{text: "Continue after pre-prompt compaction", type: "text"}]},
      events: expect.arrayContaining([
        expect.objectContaining({status: "completed", summary: "Pre-prompt compacted summary.", type: "compaction"}),
        expect.objectContaining({content: "Response after pre-prompt compaction.", type: "assistant"}),
      ]),
    });
    const finalSnapshot = snapshotEvents(events).at(-1);
    const persistedTurn = finalSnapshot?.session.turns.find((turn) =>
      turn.userMessage.contentParts.some((part) => part.type === "text" && part.text === "Continue after pre-prompt compaction")
    );
    expect(finalSnapshot).toMatchObject({type: "session.snapshot"});
    expect(persistedTurn).toMatchObject({userMessage: {contentParts: [{text: "Continue after pre-prompt compaction", type: "text"}]}});
    expect(persistedTurn?.events).toContainEqual(expect.objectContaining({status: "completed", summary: "Pre-prompt compacted summary.", type: "compaction"}));
    expect(persistedTurn?.events).toContainEqual(expect.objectContaining({content: "Response after pre-prompt compaction.", type: "assistant"}));
  });

  it("keeps content-parts metadata on the active branch when session managers are reopened", async () => {
    const sessionDir = mkdtempSync(join(tmpdir(), "supernova-session-test-"));
    tempDirs.push(sessionDir);
    const pi = createPiTestRuntime({reopenManagers: true, sessionDir});
    runtimes.push(pi);
    const {info} = pi.createSession();
    pi.faux.setResponses([fauxAssistantMessage("First response."), fauxAssistantMessage("Second response."), fauxAssistantMessage("Third response.")]);

    await pi.sendMessage({message: "first", model: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "second", model: selectedModelReference, sessionId: info.id});
    const events = await pi.sendMessage({message: "third", model: selectedModelReference, sessionId: info.id});
    const finalSnapshot = snapshotEvents(events).at(-1);

    expect(finalSnapshot?.session.turns.map((turn) => turn.userMessage.contentParts)).toEqual([
      [{text: "first", type: "text"}],
      [{text: "second", type: "text"}],
      [{text: "third", type: "text"}],
    ]);
  });

  it("persists stable checkpoint entries around git-backed turns", async () => {
    const projectPath = await createGitProject();
    tempDirs.push(projectPath);
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info, manager} = pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "after\n");
        await writeFile(join(projectPath, "created.txt"), "created\n");
        return fauxAssistantMessage("Changed files.");
      },
    ]);

    await pi.sendMessage({message: "change files", model: selectedModelReference, sessionId: info.id});

    const customEntries = manager.getBranch().filter((entry) => entry.type === "custom");
    const checkpointEntries = customEntries.filter((entry) => entry.customType === "supernova.checkpoint");
    const checkpointId = (checkpointEntries.at(-1)?.data as {checkpointId?: string} | undefined)?.checkpointId;

    expect(checkpointEntries).toHaveLength(2);
    expect(checkpointId).toEqual(expect.any(String));
    expect(customEntries.some((entry) => entry.customType === "supernova.checkpoint-patch")).toBe(false);
    await expect(gitOutput(projectPath, ["rev-parse", "--verify", `refs/supernova/checkpoints/${info.id}/${checkpointId}`])).resolves.toHaveLength(40);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("after\n");
  });

  it("keeps overflow compaction continuation in the same live turn", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession();
    pi.faux.setResponses([
      fauxAssistantMessage("", {errorMessage: "prompt is too long", stopReason: "error"}),
      fauxAssistantMessage("Compacted overflow summary."),
      fauxAssistantMessage("Continued after compaction."),
    ]);

    const events = await pi.sendMessage({message: "Fix overflow", model: selectedModelReference, sessionId: info.id});
    const liveTurns = turnEvents(events);
    const compactionTurn = liveTurns.find((event) => event.turn.events.some((turnEvent) => turnEvent.type === "compaction" && turnEvent.status === "completed"));
    const continuationTurn = liveTurns.find((event) => event.turn.events.some((turnEvent) => turnEvent.type === "assistant" && turnEvent.content.includes("Continued")));

    expect(events.find((event) => event.type === "session.compaction.ended")).toMatchObject({type: "session.compaction.ended"});
    expect(compactionTurn).toMatchObject({
      turn: {
        userMessage: {contentParts: [{text: "Fix overflow", type: "text"}]},
        events: expect.arrayContaining([expect.objectContaining({status: "completed", summary: "Compacted overflow summary.", type: "compaction"})]),
      },
    });
    expect(continuationTurn).toMatchObject({
      turn: {
        userMessage: {contentParts: [{text: "Fix overflow", type: "text"}]},
        events: expect.arrayContaining([
          expect.objectContaining({status: "completed", summary: "Compacted overflow summary.", type: "compaction"}),
          expect.objectContaining({content: "Continued after compaction.", type: "assistant"}),
        ]),
      },
    });
  });

  it("rejects the command when the selected model is unavailable", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession();

    await expect(pi.sendMessage({message: "Fix it", model: {...selectedModelReference, id: "missing-model"}, sessionId: info.id})).rejects.toThrow(
      "Selected model is not available."
    );
    expect(pi.faux.state.callCount).toBe(0);
  });

  it("rejects the command when the session cannot be found", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);

    await expect(pi.sendMessage({message: "Fix it", model: selectedModelReference, sessionId: "missing-session"})).rejects.toThrow("Session not found.");
    expect(pi.faux.state.callCount).toBe(0);
  });

  it("aborts the active provider request only through abortSession", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession();
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
          return fauxAssistantMessage("Done.");
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
    await waitUntil(() => {
      if (!events.some((event) => event.type === "connected")) throw new Error("Stream did not connect.");
    });
    const program = Effect.gen(function* () {
      const sessionRuntime = yield* SessionRuntimeService;
      yield* sessionRuntime.sendMessage({contentParts: [{text: "Fix it", type: "text"}], model: selectedModelReference, sessionId: info.id});
      yield* Effect.sleep("100 millis");
      yield* sessionRuntime.abortSession(info.id);
    });

    const run = pi.runtime.runPromise(program);
    await providerStarted;
    await waitUntil(() => expect(events.find((event) => event.type === "session.agent.started")).toBeDefined());
    await waitUntil(() => expect(providerSignal?.aborted).toBe(true));
    releaseProvider?.();
    await run;
    await pi.runtime.runPromise(Fiber.interrupt(watcher).pipe(Effect.ignore));

    expect(events.find((event) => event.type === "session.agent.started")).toBeDefined();
    expect(providerSignal?.aborted).toBe(true);
  });
});
