import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtempSync, rmSync} from "node:fs";
import {readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import type {SessionDirectoryState} from "@supernova/contracts/services/sessions/services";
import {
  assistantTexts,
  createPiTestRuntime,
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  imageAttachment,
  selectedModelReference,
  selectedPiModel,
  turnContents,
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

/** Every tool call the session's live partials and entries showed, with the arguments shown. */
function shownToolCalls(versions: readonly Session[]): Array<{readonly name: string; readonly arguments: Record<string, unknown>}> {
  return versions.flatMap((session) => {
    const partial = session.live.generation?.message;
    const messages = [...session.entries.flatMap((entry) => entry.model ?? []), ...(partial ? [partial] : [])];
    return messages.flatMap((message) => (message.role === "assistant" ? message.content.flatMap((part) => (part.type === "toolCall" ? [part] : [])) : []));
  });
}

/** Every activity the board showed for a session, in order, without repeats. */
function activities(board: readonly SessionDirectoryState[], sessionId: string): string[] {
  return board.flatMap((value) => value.sessions[sessionId]?.activity ?? []).filter((activity, index, all) => activity !== all[index - 1]);
}

/** The pending blocking compactions any version showed, and the summaries entries carried. */
function compactionsSeen(versions: readonly Session[]) {
  return {
    pending: versions.some((session) => (session.live.compactions ?? []).some((compaction) => compaction.blocking)),
    summaries: versions.at(-1)!.entries.filter((entry) => entry.kind === "pi.compaction"),
  };
}

describe("sending messages through Pi sessions", () => {
  const runtimes: Array<{unregister: () => Promise<void>}> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (runtimes.length > 0) await runtimes.pop()?.unregister();
    while (tempDirs.length > 0) rmSync(tempDirs.pop()!, {force: true, recursive: true});
  });

  it("streams the run as replicated Pi state, ending idle with the answer in its entries", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id);
    pi.faux.setResponses([fauxAssistantMessage([fauxThinking("Checking the workspace"), fauxText("Done.")])]);
    const before = await pi.sessions.get({sessionId: info.id});

    const {board, session, versions} = await pi.sendMessage({message: "Fix it", modelReference: selectedModelReference, sessionId: info.id});

    expect(session.agent).toMatchObject({model: {modelId: "claude-sonnet", provider: "anthropic"}, thinkingLevel: "high"});
    expect(activities(board, info.id)).toEqual(["idle", "running", "idle"]);
    expect(session).toEqual(await pi.sessions.get({sessionId: info.id}));
    // The run's user entry and its turn record arrive in the same version.
    const running = versions.find((version) => version.runStart !== undefined);
    expect(running?.entries.find((entry) => entry.id === running.runStart)?.contentParts).toEqual([{text: "Fix it", type: "text"}]);
    expect(turnContents(session)).toEqual([[{text: "Existing request", type: "text"}], [{text: "Fix it", type: "text"}]]);
    expect(assistantTexts(session)).toEqual(["Existing response", "Done."]);
    const answer = session.entries.at(-1)?.model?.[0];
    expect(answer?.role === "assistant" && answer.content.map((part) => part.type)).toEqual(["thinking", "text"]);
    expect(session.live.run).toBeUndefined();
    expect(session.runStart).toBeUndefined();
    // The first running version still measures the context before the answer: the earlier usage plus the new prompt.
    expect(running?.context.usedTokens).toBeGreaterThan(before.context.usedTokens!);
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

    const {session, versions} = await pi.sendMessage({message: "Read both files", modelReference: selectedModelReference, sessionId: info.id});

    // Partials are coalesced by the engine; the client hides a streaming partial's last call, every other call is whole.
    expect(shownToolCalls(versions).map((call) => call.name)).toContain("read");
    expect(shownToolCalls([session]).map((call) => call.arguments)).toEqual([{path: "one.ts"}, {path: "two.ts"}]);
    expect(session.entries.filter((entry) => entry.kind === "pi.tool-result")).toHaveLength(2);
  });

  it("keeps the session untitled without persisting a fallback when title generation fails", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    vi.spyOn(pi.titleGenerator, "generateSessionTitle").mockRejectedValue(new Error("Title generation failed"));
    pi.faux.setResponses([fauxAssistantMessage("Done.")]);

    const {session} = await pi.sendMessage({message: "Fix the flaky tests", modelReference: selectedModelReference, sessionId: info.id});

    expect((await pi.store.find(info.id))!.title).toBeUndefined();
    expect(session.title).toBe("Untitled session");
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

    const {session} = await pi.sendMessage({contentParts, modelReference: selectedModelReference, sessionId: info.id});

    expect(providerUserContent).toEqual([
      {text: "Review @src/file.ts", type: "text"},
      {data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", mimeType: "image/png", type: "image"},
    ]);
    // Authored parts are stored without the image payload; Pi's user entry carries the image.
    expect(turnContents(session)).toMatchObject([
      [
        {text: "Review ", type: "text"},
        {id: "ref-1", kind: "file", value: "@src/file.ts"},
        {id: "image-1", type: "attachment"},
      ],
    ]);
    expect(turnContents(session)[0]?.[2]).not.toHaveProperty("contentBase64");
    expect(session.entries[0]?.model?.[0]).toMatchObject({role: "user", content: expect.arrayContaining([expect.objectContaining({type: "image", mimeType: "image/png"})])});
    expect(assistantTexts(session)).toEqual(["Reviewed."]);
  });

  it("streams a pending auto-compaction in pi.live and commits its summary entry", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id, {requestText: "Older request", assistantText: "Older response."});
    await pi.appendConversation(info.id, {requestText: "x".repeat((selectedPiModel.contextWindow - 20_000) * 4), assistantText: "Old response."});
    // The engine compacts before the request once the estimate crosses the threshold, so the summary comes first.
    pi.faux.setResponses([fauxAssistantMessage("Compacted summary."), fauxAssistantMessage("Done.")]);

    const {board, versions} = await pi.sendMessage({message: "Continue", modelReference: selectedModelReference, sessionId: info.id});
    const seen = compactionsSeen(versions);

    expect(seen.pending).toBe(true);
    expect(activities(board, info.id)).toContain("compacting");
    expect(JSON.stringify(seen.summaries)).toContain("Compacted summary.");
    expect(assistantTexts(versions.at(-1)!).at(-1)).toBe("Done.");
  });

  it("keeps pre-prompt compaction in the submitted turn", async () => {
    const pi = await createPiTestRuntime({settings: {compaction: {enabled: false}}});
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id, {requestText: "Older request", assistantText: "Older response."});
    await pi.appendConversation(info.id, {requestText: "x".repeat(selectedPiModel.contextWindow * 4), assistantText: "Large previous response"});
    pi.settings.applyOverrides({compaction: {enabled: true, reserveTokens: 1000}});
    pi.faux.setResponses([fauxAssistantMessage("Pre-prompt compacted summary."), fauxAssistantMessage("Response after pre-prompt compaction.")]);

    const {session, versions} = await pi.sendMessage({message: "Continue after pre-prompt compaction", modelReference: selectedModelReference, sessionId: info.id});
    const seen = compactionsSeen(versions);
    const userIndex = session.entries.findIndex((entry) => entry.contentParts?.some((part) => part.type === "text" && part.text === "Continue after pre-prompt compaction"));
    const summaryIndex = session.entries.findIndex((entry, index) => index > userIndex && entry.kind === "pi.compaction");

    expect(seen.pending).toBe(true);
    // The summary follows the turn's user entry, so it renders inside the submitted turn.
    expect(userIndex).toBeGreaterThanOrEqual(0);
    expect(summaryIndex).toBeGreaterThan(userIndex);
    expect(JSON.stringify(session.entries[summaryIndex])).toContain("Pre-prompt compacted summary.");
    expect(assistantTexts(session).at(-1)).toBe("Response after pre-prompt compaction.");
  });

  it("keeps one open session across commands and reopens it from its file", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    pi.faux.setResponses([fauxAssistantMessage("First response."), fauxAssistantMessage("Second response."), fauxAssistantMessage("Third response.")]);

    await pi.sendMessage({message: "first", modelReference: selectedModelReference, sessionId: info.id});
    await pi.sendMessage({message: "second", modelReference: selectedModelReference, sessionId: info.id});
    const loadsBefore = pi.loadCount;
    const {session} = await pi.sendMessage({message: "third", modelReference: selectedModelReference, sessionId: info.id});
    expect(pi.loadCount).toBe(loadsBefore);

    await pi.sessionRuntime.dispose();
    const reopened = await pi.sessions.get({sessionId: info.id});
    expect(reopened.entries).toEqual(session.entries);
    expect(turnContents(reopened)).toEqual([[{text: "first", type: "text"}], [{text: "second", type: "text"}], [{text: "third", type: "text"}]]);
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

    const {error} = await pi.sendMessage({captureCheckpoints: false, message: "change files", modelReference: selectedModelReference, sessionId: info.id});

    expect(captureCount).toBe(0);
    expect(error).toBeNull();
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

    const {error, session} = await pi.sendMessage({message: "change files", modelReference: selectedModelReference, sessionId: info.id});

    expect(error).toBeNull();
    expect(await pi.turnRecords(info.id)).toMatchObject([{before: {status: "failed"}, after: {status: "captured"}}]);
    expect(turnContents(session).at(-1)).toEqual([{text: "change files", type: "text"}]);
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

    const {error, session} = await pi.sendMessage({message: "change files", modelReference: selectedModelReference, sessionId: info.id});

    expect(error).toBeNull();
    expect(await pi.turnRecords(info.id)).toMatchObject([{before: {status: "captured"}, after: {status: "failed"}}]);
    expect(turnContents(session).at(-1)).toEqual([{text: "change files", type: "text"}]);
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

    const {session, versions} = await pi.sendMessage({message: "Fix overflow", modelReference: selectedModelReference, sessionId: info.id});
    const userIndex = session.entries.findIndex((entry) => entry.contentParts?.some((part) => part.type === "text" && part.text === "Fix overflow"));
    const after = session.entries.slice(userIndex + 1);

    expect(compactionsSeen(versions).pending).toBe(true);
    // The summary and the continuation both follow the turn's user entry, with no other turn between.
    expect(after.some((entry) => entry.kind === "pi.compaction" && JSON.stringify(entry).includes("Compacted overflow summary."))).toBe(true);
    expect(assistantTexts({entries: after}).at(-1)).toBe("Continued after compaction.");
    expect(after.some((entry) => entry.contentParts !== undefined)).toBe(false);
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

  it("shows the running turn in reads and settles idle after aborting an active provider request", async () => {
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
    const observation = await pi.observe(info.id);
    try {
      const run = pi.sessionRuntime.sendMessage({contentParts: [{text: "Fix it", type: "text"}], modelReference: selectedModelReference, sessionId: info.id});
      await providerStarted;
      const running = await pi.sessions.get({sessionId: info.id});
      expect(running.live.run).toBeDefined();
      expect(turnContents(running)).toEqual([[{text: "Existing request", type: "text"}], [{text: "Fix it", type: "text"}]]);

      const abortRun = pi.sessionRuntime.abort({sessionId: info.id});
      await waitUntil(() => expect(activities(observation.board, info.id)).toContain("running"));
      await waitUntil(() => expect(providerSignal?.aborted).toBe(true));
      releaseProvider?.();
      await abortRun;
      await run;
    } finally {
      releaseProvider?.();
      observation.stop();
    }

    expect(providerSignal?.aborted).toBe(true);
    await pi.settled(info.id);
    expect((await pi.sessions.get({sessionId: info.id})).live.run).toBeUndefined();
  });
});

describe("observing a run", () => {
  it("lets an observer that subscribed mid-run follow the replicated state to the server's final document", async () => {
    const pi = await createPiTestRuntime({tokensPerSecond: 1_000});
    try {
      const {info} = await pi.createSession();
      pi.faux.setResponses([fauxAssistantMessage(`Streamed. ${"word ".repeat(150)}`)]);
      await pi.sessionRuntime.sendMessage({contentParts: [{text: "Go", type: "text"}], modelReference: selectedModelReference, sessionId: info.id});
      const observation = await pi.observe(info.id);
      try {
        await pi.settled(info.id);
        const final: Session = await pi.sessions.get({sessionId: info.id});
        await waitUntil(() => expect(observation.versions.at(-1)).toEqual(final));
      } finally {
        observation.stop();
      }
      expect(observation.versions[0]?.live.run).toBeDefined();
      expect(observation.versions.length).toBeGreaterThan(1);
    } finally {
      await pi.unregister();
    }
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
      await second.sessions.get({sessionId: info.id});
      expect(second.lastError(info.id)).toBeNull();
      await waitUntil(async () => {
        const session = await second.sessions.get({sessionId: info.id});
        expect(assistantTexts(session)).toContain("Recovered answer.");
      });
      expect(turnContents(await second.sessions.get({sessionId: info.id}))).toEqual([[{text: "Long task", type: "text"}]]);
    } finally {
      await second.unregister();
      rmSync(sessionStorageRoot, {force: true, recursive: true});
    }
  });
});

describe("state under delayed frames", () => {
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
      const {versions} = await pi.sendMessage({message: "Answer once", modelReference: selectedModelReference, sessionId: info.id});
      for (const version of versions) {
        const partial = version.live.generation?.message;
        const shown = assistantTexts(version).filter((text) => text.includes("The one answer.")).length;
        const streaming = partial?.content.some((part) => part.type === "text" && part.text.includes("The one answer.")) ? 1 : 0;
        expect(shown + streaming).toBeLessThanOrEqual(1);
      }
    } finally {
      await pi.unregister();
    }
  });
});
