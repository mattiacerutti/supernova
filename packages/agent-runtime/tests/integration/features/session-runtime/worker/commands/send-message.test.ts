import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtempSync, rmSync} from "node:fs";
import {readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
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
} from "@tests/support/session-runtime";

const execFilePromise = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFilePromise("git", [...args], {cwd, encoding: "utf8"});
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

describe("sending messages through Pi sessions", () => {
  const runtimes: Array<{unregister: () => Promise<void>}> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (runtimes.length > 0) await runtimes.pop()?.unregister();
    while (tempDirs.length > 0) rmSync(tempDirs.pop()!, {force: true, recursive: true});
  });

  it("publishes session lifecycle, live turn, and final session snapshots", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id);
    pi.faux.setResponses([fauxAssistantMessage([fauxThinking("Checking the workspace"), fauxText("Done.")])]);
    const before = await pi.sessions.get({sessionId: info.id});

    const events = await pi.sendMessage({message: "Fix it", modelReference: selectedModelReference, sessionId: info.id});

    expect(await pi.agent(info.id)).toMatchObject({model: {modelId: "claude-sonnet", provider: "anthropic"}, thinkingLevel: "high"});
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
    const liveContexts = turnEvents(events).map((event) => event.context.usedTokens);
    // The first frame still measures the context before the answer: the earlier usage plus the new prompt.
    expect(liveContexts[0]).toBeGreaterThan(before.context.usedTokens!);
    expect(liveContexts.at(-1)).toEqual(finalSnapshot?.session.context.usedTokens);
  });

  it("reveals each tool's completed inputs while later calls are still streaming", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    pi.faux.setResponses([
      fauxAssistantMessage(
        [
          {type: "toolCall", id: "call-1", name: "read", arguments: {path: "one.ts"}},
          {type: "toolCall", id: "call-2", name: "read", arguments: {path: "two.ts"}},
        ],
        {stopReason: "toolUse"}
      ),
      fauxAssistantMessage("Done."),
    ]);

    const events = await pi.sendMessage({message: "Read both files", modelReference: selectedModelReference, sessionId: info.id});
    const toolsByUpdate = turnEvents(events).map((event) => event.turn.events.flatMap((part) => (part.type === "tool" && part.tool ? [part.tool] : [])));
    const shownPaths = toolsByUpdate.flat().flatMap((tool) => (tool.kind === "file-read" && tool.input ? [tool.input.path] : []));

    // Streaming partials are coalesced by the engine, so intermediate states may be skipped; a shown input is
    // always complete, and both calls end up visible with their inputs.
    expect(shownPaths.every((path) => path === "one.ts" || path === "two.ts")).toBe(true);
    expect(toolsByUpdate).toContainEqual([
      expect.objectContaining({kind: "file-read", input: expect.objectContaining({path: "one.ts"})}),
      expect.objectContaining({kind: "file-read", input: expect.objectContaining({path: "two.ts"})}),
    ]);
  });

  it("uses the first user message without persisting a fallback when title generation fails", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    vi.spyOn(pi.titleGenerator, "generateSessionTitle").mockRejectedValue(new Error("Title generation failed"));
    pi.faux.setResponses([fauxAssistantMessage("Done.")]);

    const events = await pi.sendMessage({message: "Fix the flaky tests", modelReference: selectedModelReference, sessionId: info.id});

    expect((await pi.store.record(info.id)).title).toBeUndefined();
    expect(snapshotEvents(events).at(-1)?.session.title).toBe("Fix the flaky tests");
  });

  it("sends authored text and images to the provider while displaying authored content parts", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
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

    const events = await pi.sendMessage({contentParts, modelReference: selectedModelReference, sessionId: info.id});

    expect(providerUserContent).toEqual([
      {text: "Review @src/file.ts", type: "text"},
      {data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", mimeType: "image/png", type: "image"},
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
                {contentBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", id: "image-1"},
              ],
            },
          },
        ],
      },
      type: "session.snapshot",
    });
  });

  it("streams pending and completed auto-compaction as part of the live and final turn snapshots", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id, {requestText: "Older request", assistantText: "Older response."});
    await pi.appendConversation(info.id, {requestText: "x".repeat((selectedPiModel.contextWindow - 20_000) * 4), assistantText: "Old response."});
    // The engine compacts before the request once the estimate crosses the threshold, so the summary comes first.
    pi.faux.setResponses([fauxAssistantMessage("Compacted summary."), fauxAssistantMessage("Done.")]);

    const events = await pi.sendMessage({message: "Continue", modelReference: selectedModelReference, sessionId: info.id});
    const liveCompactionEvents = events.filter(isTurnEvent).flatMap((event) => event.turn.events.filter((turnEvent) => turnEvent.type === "compaction"));

    expect(liveCompactionEvents.map((event) => event.status)).toEqual(expect.arrayContaining(["pending", "completed"]));
    expect(liveCompactionEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({status: "pending", type: "compaction"}),
        expect.objectContaining({status: "completed", summary: expect.stringContaining("Compacted summary."), type: "compaction"}),
      ])
    );
    expect(events.find((event) => event.type === "session.compaction.ended")).toMatchObject({type: "session.compaction.ended"});
  });

  it("keeps pre-prompt compaction in the submitted turn", async () => {
    const pi = await createPiTestRuntime({settings: {compaction: {enabled: false}}});
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id, {requestText: "Older request", assistantText: "Older response."});
    await pi.appendConversation(info.id, {requestText: "x".repeat(selectedPiModel.contextWindow * 4), assistantText: "Large previous response"});
    pi.settings.applyOverrides({compaction: {enabled: true, reserveTokens: 1000}});
    pi.faux.setResponses([fauxAssistantMessage("Pre-prompt compacted summary."), fauxAssistantMessage("Response after pre-prompt compaction.")]);

    const events = await pi.sendMessage({message: "Continue after pre-prompt compaction", modelReference: selectedModelReference, sessionId: info.id});
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
        expect.objectContaining({status: "completed", summary: expect.stringContaining("Pre-prompt compacted summary."), type: "compaction"}),
        expect.objectContaining({content: "Response after pre-prompt compaction.", type: "assistant"}),
      ]),
    });
    const finalSnapshot = snapshotEvents(events).at(-1);
    const persistedTurn = finalSnapshot?.session.turns.find((turn) =>
      turn.userMessage.contentParts.some((part) => part.type === "text" && part.text === "Continue after pre-prompt compaction")
    );
    expect(finalSnapshot).toMatchObject({type: "session.snapshot"});
    expect(persistedTurn).toMatchObject({userMessage: {contentParts: [{text: "Continue after pre-prompt compaction", type: "text"}]}});
    expect(persistedTurn?.events).toContainEqual(
      expect.objectContaining({status: "completed", summary: expect.stringContaining("Pre-prompt compacted summary."), type: "compaction"})
    );
    expect(persistedTurn?.events).toContainEqual(expect.objectContaining({content: "Response after pre-prompt compaction.", type: "assistant"}));
  });

  it("keeps one open session across commands and reopens it from its file", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    pi.faux.setResponses([fauxAssistantMessage("First response."), fauxAssistantMessage("Second response."), fauxAssistantMessage("Third response.")]);

    await pi.sendMessage({message: "first", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "second", modelReference: selectedModelReference, sessionId: info.id});
    const loadsBefore = pi.loadCount;
    const events = await pi.sendMessage({message: "third", modelReference: selectedModelReference, sessionId: info.id});
    expect(pi.loadCount).toBe(loadsBefore);

    await pi.store.release(info.id);
    const reopened = await pi.sessions.get({sessionId: info.id});
    expect(reopened.turns).toEqual(snapshotEvents(events).at(-1)?.session.turns);
    expect(reopened.turns.map((turn) => turn.userMessage.contentParts)).toEqual([
      [{text: "first", type: "text"}],
      [{text: "second", type: "text"}],
      [{text: "third", type: "text"}],
    ]);
  });

  it("persists stable checkpoint entries around git-backed turns", async () => {
    const projectPath = await createGitProject();
    tempDirs.push(projectPath);
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession(projectPath);
    pi.faux.setResponses([
      async () => {
        await writeFile(join(projectPath, "file.txt"), "after\n");
        await writeFile(join(projectPath, "created.txt"), "created\n");
        return fauxAssistantMessage("Changed files.");
      },
    ]);

    await pi.sendMessage({message: "change files", modelReference: selectedModelReference, sessionId: info.id});

    const [record] = await pi.turnRecords(info.id);

    expect(record).toMatchObject({before: {status: "captured", sessionId: info.id}, after: {status: "captured", sessionId: info.id}});
    expect(record?.after?.checkpointId).not.toBe(record?.before?.checkpointId);
    await expect(readFile(join(projectPath, "file.txt"), "utf8")).resolves.toBe("after\n");
  });

  it("skips both captures and records disabled checkpoints when the payload turns capture off", async () => {
    let captureCount = 0;
    const checkpointStore: CheckpointStore = {
      capture: async () => {
        captureCount++;
      },
      deleteSession: async () => undefined,
      restore: async () => undefined,
    };
    const pi = await createPiTestRuntime({checkpointStore});
    runtimes.push(pi);
    const {info} = await pi.createSession();
    pi.faux.setResponses([fauxAssistantMessage("Changed files.")]);

    const events = await pi.sendMessage({captureCheckpoints: false, message: "change files", modelReference: selectedModelReference, sessionId: info.id});

    expect(captureCount).toBe(0);
    expect(events.filter((event) => event.type === "session.error")).toEqual([]);
    expect(await pi.turnRecords(info.id)).toMatchObject([{before: {status: "disabled"}, after: {status: "disabled"}}]);
  });

  it("runs the turn with an uncovered before-turn checkpoint when the initial capture fails", async () => {
    let captureCount = 0;
    const checkpointStore: CheckpointStore = {
      capture: async () => {
        captureCount++;
        if (captureCount === 1) throw new Error("Sensitive Git failure");
      },
      deleteSession: async () => undefined,
      restore: async () => undefined,
    };
    const pi = await createPiTestRuntime({checkpointStore});
    runtimes.push(pi);
    const {info} = await pi.createSession();
    pi.faux.setResponses([fauxAssistantMessage("Changed files.")]);

    const events = await pi.sendMessage({message: "change files", modelReference: selectedModelReference, sessionId: info.id});

    expect(events.filter((event) => event.type === "session.error")).toEqual([]);
    expect(await pi.turnRecords(info.id)).toMatchObject([{before: {status: "failed"}, after: {status: "captured"}}]);
    expect(snapshotEvents(events).at(-1)?.session.turns.at(-1)?.userMessage.contentParts).toEqual([{text: "change files", type: "text"}]);
    expect(pi.faux.state.callCount).toBe(1);
  });

  it("commits the turn with an uncovered after-turn checkpoint when settled capture fails", async () => {
    let captureCount = 0;
    const checkpointStore: CheckpointStore = {
      capture: async () => {
        captureCount++;
        if (captureCount === 2) throw new Error("Sensitive Git failure");
      },
      deleteSession: async () => undefined,
      restore: async () => undefined,
    };
    const pi = await createPiTestRuntime({checkpointStore});
    runtimes.push(pi);
    const {info} = await pi.createSession();
    pi.faux.setResponses([fauxAssistantMessage("Changed files.")]);

    const events = await pi.sendMessage({message: "change files", modelReference: selectedModelReference, sessionId: info.id});

    expect(events.filter((event) => event.type === "session.error")).toEqual([]);
    expect(await pi.turnRecords(info.id)).toMatchObject([{before: {status: "captured"}, after: {status: "failed"}}]);
    expect(snapshotEvents(events).at(-1)?.session.turns.at(-1)?.userMessage.contentParts).toEqual([{text: "change files", type: "text"}]);
    expect(pi.faux.state.callCount).toBe(1);
  });

  it("keeps overflow compaction continuation in the same live turn", async () => {
    const pi = await createPiTestRuntime({settings: {compaction: {enabled: true, keepRecentTokens: 16}}});
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id, {requestText: "Older request", assistantText: "Older response."});
    // Keep pre-prompt estimation below the threshold so the provider error triggers recovery.
    await pi.appendConversation(info.id, {requestText: "Recent request ".repeat(20), assistantText: "Old response."});
    pi.faux.setResponses([
      fauxAssistantMessage("", {errorMessage: "prompt is too long", stopReason: "error"}),
      fauxAssistantMessage("Compacted overflow summary."),
      fauxAssistantMessage("Continued after compaction."),
    ]);

    const events = await pi.sendMessage({message: "Fix overflow", modelReference: selectedModelReference, sessionId: info.id});
    const liveTurns = turnEvents(events);
    const compactionTurn = liveTurns.find((event) => event.turn.events.some((turnEvent) => turnEvent.type === "compaction" && turnEvent.status === "completed"));
    const continuationTurn = liveTurns.find((event) => event.turn.events.some((turnEvent) => turnEvent.type === "assistant" && turnEvent.content.includes("Continued")));

    expect(events.find((event) => event.type === "session.compaction.ended")).toMatchObject({type: "session.compaction.ended"});
    expect(compactionTurn).toMatchObject({
      turn: {
        userMessage: {contentParts: [{text: "Fix overflow", type: "text"}]},
        events: expect.arrayContaining([expect.objectContaining({status: "completed", summary: expect.stringContaining("Compacted overflow summary."), type: "compaction"})]),
      },
    });
    expect(continuationTurn).toMatchObject({
      turn: {
        userMessage: {contentParts: [{text: "Fix overflow", type: "text"}]},
        events: expect.arrayContaining([
          expect.objectContaining({status: "completed", summary: expect.stringContaining("Compacted overflow summary."), type: "compaction"}),
          expect.objectContaining({content: "Continued after compaction.", type: "assistant"}),
        ]),
      },
    });
  });

  it("rejects an unavailable model without leaving the session locked", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();

    await expect(pi.sendMessage({message: "Fix it", modelReference: {...selectedModelReference, id: "missing-model"}, sessionId: info.id})).rejects.toThrow(
      "Selected model is not available."
    );

    pi.faux.setResponses([fauxAssistantMessage("Recovered.")]);
    await pi.sendMessage({message: "Try again", modelReference: selectedModelReference, sessionId: info.id});
    expect(pi.faux.state.callCount).toBe(1);
  });

  it("rejects a registered model whose provider has no credentials with an auth error before any provider work", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    pi.modelRuntime.registerProvider("unauthenticated", {
      api: selectedPiModel.api,
      baseUrl: selectedPiModel.baseUrl,
      models: [
        {
          api: selectedPiModel.api,
          baseUrl: selectedPiModel.baseUrl,
          contextWindow: selectedPiModel.contextWindow,
          cost: selectedPiModel.cost,
          id: "locked-model",
          input: [...selectedPiModel.input],
          maxTokens: selectedPiModel.maxTokens,
          name: "Locked Model",
          reasoning: selectedPiModel.reasoning,
        },
      ],
      name: "Unauthenticated",
    });
    expect(pi.modelRuntime.getModel("unauthenticated", "locked-model")).toBeDefined();
    expect(pi.modelRuntime.getAvailableSnapshot().some((model) => model.provider === "unauthenticated")).toBe(false);

    await expect(
      pi.sendMessage({message: "Fix it", modelReference: {id: "locked-model", providerId: "unauthenticated", thinkingLevel: "off"}, sessionId: info.id})
    ).rejects.toThrow("No API key for unauthenticated/locked-model");
    expect(pi.faux.state.callCount).toBe(0);

    pi.faux.setResponses([fauxAssistantMessage("Recovered.")]);
    await pi.sendMessage({message: "Try again", modelReference: selectedModelReference, sessionId: info.id});
    expect(pi.faux.state.callCount).toBe(1);
  });

  it("rejects the command when the session cannot be found", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);

    await expect(pi.sendMessage({message: "Fix it", modelReference: selectedModelReference, sessionId: "missing-session"})).rejects.toThrow("Session not found.");
    expect(pi.faux.state.callCount).toBe(0);
  });

  it("does not prompt Pi when aborted during message preparation", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    let completeTitleGeneration: (() => void) | undefined;
    const titleGenerationStarted = new Promise<void>((resolveStarted) => {
      vi.spyOn(pi.titleGenerator, "generateSessionTitle").mockImplementation(
        () =>
          new Promise<string>((resolveTitle) => {
            completeTitleGeneration = () => resolveTitle("Generated title");
            resolveStarted();
          })
      );
    });
    pi.faux.setResponses([fauxAssistantMessage("Should not run.")]);

    const sendRun = pi.sessionRuntime.sendMessage({contentParts: [{text: "Fix it", type: "text"}], modelReference: selectedModelReference, sessionId: info.id});

    await titleGenerationStarted;
    await pi.sessionRuntime.abort({sessionId: info.id});
    completeTitleGeneration?.();
    await expect(sendRun).rejects.toThrow("Session was cancelled.");

    expect(pi.faux.state.callCount).toBe(0);
  });

  it("keeps committed reads stable while aborting an active provider request", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id);
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
    const {events, stop} = await pi.watchEvents();
    try {
      const run = pi.sessionRuntime.sendMessage({contentParts: [{text: "Fix it", type: "text"}], modelReference: selectedModelReference, sessionId: info.id});
      await providerStarted;
      const committedSession = await pi.sessions.get({sessionId: info.id});
      expect(committedSession.turns.map((turn) => turn.userMessage.contentParts)).toEqual([[{text: "Existing request", type: "text"}]]);

      const abortRun = pi.sessionRuntime.abort({sessionId: info.id});
      await waitUntil(() => expect(events.find((event) => event.type === "session.agent.started")).toBeDefined());
      await waitUntil(() => expect(providerSignal?.aborted).toBe(true));
      releaseProvider?.();
      await abortRun;
      await run;
    } finally {
      releaseProvider?.();
      await stop();
    }

    expect(events.find((event) => event.type === "session.agent.started")).toBeDefined();
    expect(providerSignal?.aborted).toBe(true);
  });
});

describe("committed reads around settlement", () => {
  it("leaves a finished run out of committed reads until its settled snapshot is published", async () => {
    const pi = await createPiTestRuntime();
    const {info} = await pi.createSession();
    pi.faux.setResponses([fauxAssistantMessage("Done.")]);
    const committedTurnCounts: number[] = [];
    const {events, stop} = await pi.watchEvents();
    try {
      await pi.sessionRuntime.sendMessage({contentParts: [{text: "Fix it", type: "text"}], modelReference: selectedModelReference, sessionId: info.id});
      // Read committed state as the client would, as often as possible, until the snapshot arrives.
      while (!events.some((event) => event.type === "session.snapshot")) {
        const session = (await pi.sessionRuntime.getCommittedSession({sessionId: info.id})) ?? (await pi.sessions.get({sessionId: info.id}));
        if (!events.some((event) => event.type === "session.snapshot")) committedTurnCounts.push(session.turns.length);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      await stop();
      await pi.unregister();
    }
    expect(committedTurnCounts.length).toBeGreaterThan(0);
    expect(new Set(committedTurnCounts)).toEqual(new Set([0]));
  });
});

describe("recovering a session after the server stops mid-turn", () => {
  it("resumes the interrupted turn from its file and settles it", async () => {
    const sessionStorageRoot = mkdtempSync(join(tmpdir(), "supernova-restart-"));
    const first = await createPiTestRuntime({sessionStorageRoot});
    const {info} = await first.createSession();
    const started = new Promise<void>((resolve) => {
      first.faux.setResponses([
        async (_context, options) => {
          resolve();
          // Never answers: the server stops while this request is in flight.
          await new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
          return fauxAssistantMessage("never");
        },
      ]);
    });
    await first.sessionRuntime.sendMessage({contentParts: [{text: "Long task", type: "text"}], modelReference: selectedModelReference, sessionId: info.id});
    await started;
    await first.unregister();

    const second = await createPiTestRuntime({sessionStorageRoot});
    try {
      second.faux.setResponses([fauxAssistantMessage("Recovered answer.")]);
      const events = await second.collectEvents(
        () => second.sessions.get({sessionId: info.id}).then(() => second.store.file(info.id)),
        () => undefined
      );
      expect(events.filter((event) => event.type === "session.error")).toEqual([]);
      await waitUntil(async () => {
        const session = await second.sessions.get({sessionId: info.id});
        expect(session.turns.at(-1)?.events).toContainEqual(expect.objectContaining({content: "Recovered answer.", type: "assistant"}));
      });
      expect((await second.sessions.get({sessionId: info.id})).turns.map((turn) => turn.userMessage.contentParts)).toEqual([[{text: "Long task", type: "text"}]]);
    } finally {
      await second.unregister();
      rmSync(sessionStorageRoot, {force: true, recursive: true});
    }
  });
});

describe("live turns under delayed frames", () => {
  it("never shows a streamed answer and its final entry together", async () => {
    const pi = await createPiTestRuntime({tokensPerSecond: 1_000});
    try {
      const {info} = await pi.createSession();
      // A slow stream: partials are committed (every 100 ms) before the final answer.
      pi.faux.setResponses([fauxAssistantMessage(`The one answer. ${"word ".repeat(200)}`)]);
      // Delay every frame's handling past the next commit, as a busy server would.
      const session = await pi.store.file(info.id);
      const watch = session.watch.bind(session);
      session.watch = (conversationId, listener) => watch(conversationId, (view) => setTimeout(() => listener(view), 150));
      const events = await pi.sendMessage({message: "Answer once", modelReference: selectedModelReference, sessionId: info.id});
      for (const event of events) {
        if (event.type !== "session.turn") continue;
        expect(event.turn.events.filter((turnEvent) => turnEvent.type === "assistant" && turnEvent.content.includes("The one answer.")).length).toBeLessThanOrEqual(1);
      }
    } finally {
      await pi.unregister();
    }
  });
});

describe("a run that settles before its send returns", () => {
  it("publishes no live turn after the settled snapshot", async () => {
    const pi = await createPiTestRuntime();
    try {
      const {info} = await pi.createSession();
      pi.faux.setResponses([fauxAssistantMessage("Quick.")]);
      // Hold the send's return until the run has settled, as a fast model on a busy server does.
      const session = await pi.store.file(info.id);
      const submit = session.submit.bind(session);
      let settled: () => void = () => undefined;
      const snapshotSeen = new Promise<void>((resolve) => (settled = resolve));
      session.submit = async (input) => {
        const result = await submit(input);
        await snapshotSeen;
        return result;
      };
      const {events, stop} = await pi.watchEvents();
      try {
        const sent = pi.sessionRuntime.sendMessage({contentParts: [{text: "Fast", type: "text"}], modelReference: selectedModelReference, sessionId: info.id});
        await waitUntil(() => expect(events.some((event) => event.type === "session.snapshot")).toBe(true));
        settled();
        await sent;
        // Any later commit produces another frame.
        await pi.sessions.rename({sessionId: info.id, title: "Renamed"});
        await session.updateState(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 50));
      } finally {
        await stop();
      }
      const snapshotIndex = events.findIndex((event) => event.type === "session.snapshot");
      expect(events.slice(snapshotIndex + 1).filter((event) => event.type === "session.turn")).toEqual([]);
      expect(await pi.sessionRuntime.getCommittedSession({sessionId: info.id})).toBeUndefined();
    } finally {
      await pi.unregister();
    }
  });
});
