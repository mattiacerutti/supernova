import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {ModelRuntime, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {Api} from "@earendil-works/pi-ai/compat";
import {fauxAssistantMessage, fauxToolCall, registerFauxProvider} from "@earendil-works/pi-ai/compat";
import {afterEach, describe, expect, it} from "vitest";
import type {SessionFileSetup} from "@supernova/agent-runtime/features/chat/natives/session-file";
import {SessionFile} from "@supernova/agent-runtime/features/chat/natives/session-file";
import {FileCheckpointStore} from "@supernova/agent-runtime/features/chat/natives/checkpoint-store";
import {chatDocument} from "@supernova/agent-runtime/features/chat/lib/transcript/chat-document";
import {BACKGROUND_CONTEXT, withAbortSignal} from "@earendil-works/chord/context";

const ctx = BACKGROUND_CONTEXT;
import type {EntryRecord} from "@earendil-works/pi-durable";
import {USER_ENTRY_KIND, userEntryData} from "@supernova/contracts/services/chat/schemas";
import type {TranscriptFrame} from "@supernova/agent-runtime/features/chat/natives/transcript";
import {createPiTestRuntime, selectedPiModel, waitUntil} from "@tests/support/test-runtime";

async function openFile(setup: SessionFileSetup & {readonly sessionId: string; readonly path: string}) {
  return SessionFile.open({...setup, checkpoints: new FileCheckpointStore(join(setup.path, "..", "checkpoints")), onReport: () => undefined}, ctx);
}

async function documentOf(file: SessionFile, record: {readonly id: string; readonly updatedAt: string}) {
  const {state, view, undone} = await file.transcript.currentFrame(ctx);
  return chatDocument({record, view, undone, state, contextUsage: await file.transcript.contextUsage(state.conversation, view, ctx)});
}

describe("a session file", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, {recursive: true, force: true});
  });

  it("moves undo and redo to a conversation ending at the shown turns, reusing one that does, and drops the undone turns on a send", async () => {
    const pi = await createPiTestRuntime();
    const root = mkdtempSync(join(tmpdir(), "sn-file-"));
    dirs.push(root);
    const id = "s1";
    const record = {id, updatedAt: new Date(0).toISOString()};
    const settings = SettingsManager.inMemory({compaction: {enabled: false, keepRecentTokens: 1}});
    const file = await openFile({
      sessionId: id,
      path: join(root, id, "session.sqlite"),
      cwd: pi.defaultProjectRoot,
      modelRuntime: pi.modelRuntime,
      settings: () => settings,
      resources: () => ({contextFiles: [], skills: []}),
      extensions: () => [],
    });
    try {
      const model = {provider: selectedPiModel.provider, modelId: selectedPiModel.id, thinkingLevel: "off"};
      const send = async (text: string) => {
        pi.faux.setResponses([fauxAssistantMessage(`Response to ${text}`)]);
        const sent = await file.send({content: text, contentParts: [{type: "text", text}], captureCheckpoint: false, model}, ctx);
        expect((await sent.answered()).status).toBe("done");
      };
      const userTexts = (entries: readonly {readonly kind: string; readonly model?: readonly unknown[]}[]) =>
        entries.filter((entry) => entry.kind === USER_ENTRY_KIND).map((entry) => (entry.model?.[0] as {content?: unknown} | undefined)?.content);
      await send("First");
      await send("Second");
      const full = await documentOf(file, record);
      // A cancelled call stops its reads.
      const cancelled = withAbortSignal(AbortSignal.abort(), ctx);
      const secondTurn = full.entries.items.findLast((entry) => entry.kind === USER_ENTRY_KIND)!.id;
      await expect(file.transcript.loadHistory({side: "entries", edge: secondTurn}, cancelled)).rejects.toThrow("This operation was aborted");
      const stateOf = async () => (await file.transcript.currentFrame(ctx)).state;
      const documentAfter = async (activeCount: number) => {
        await file.navigate(false, () => activeCount, ctx);
        return documentOf(file, record);
      };

      const undone = await documentAfter(1);
      expect(userTexts(undone.entries.items)).toEqual(["First"]);
      expect(userTexts(undone.undone.items)).toEqual(["Second"]);
      const afterFirst = await stateOf();
      expect(afterFirst).toMatchObject({redoConversation: 1});
      expect(afterFirst.conversation).not.toBe(1);

      const empty = await documentAfter(0);
      expect(empty.entries.items).toEqual([]);
      expect(userTexts(empty.undone.items)).toEqual(["First", "Second"]);
      // Undoing everything starts an empty conversation: it keeps the agent the first turn began with.
      expect(empty.agent).toMatchObject({model: {modelId: selectedPiModel.id}});

      // Redo to the end returns to the conversation the turns are on; back to one turn reuses the fork made for it.
      expect((await documentAfter(2)).entries).toEqual(full.entries);
      expect(await stateOf()).toMatchObject({conversation: 1});
      expect((await stateOf()).redoConversation).toBeUndefined();
      await documentAfter(1);
      expect((await stateOf()).conversation).toBe(afterFirst.conversation);

      // Sending from undone turns continues the shown conversation and drops the undone turn's checkpoints.
      const second = undone.undone.items[0]!.id;
      await send("Branch");
      const branched = await documentOf(file, record);
      expect(userTexts(branched.entries.items)).toEqual(["First", "Branch"]);
      expect(branched.undone.items).toEqual([]);
      const state = await stateOf();
      expect(state).toMatchObject({conversation: afterFirst.conversation});
      expect(state.redoConversation).toBeUndefined();
      expect(state.checkpoints[String(second)]).toBeUndefined();
      expect(Object.keys(state.checkpoints)).toHaveLength(2);

      // The fork has grown past where it was made, so undoing the new turn forks again instead of reusing it.
      await documentAfter(1);
      expect((await stateOf()).conversation).not.toBe(afterFirst.conversation);

      pi.faux.setResponses([fauxAssistantMessage("Compacted summary")]);
      await file.compact(model, ctx);
      expect((await documentOf(file, record)).entries.items.at(-1)?.kind).toBe("pi.compaction");
    } finally {
      await file.close(ctx);
      await pi.unregister();
    }
  });

  it("follows the conversation from its newest turns: a seed arrives whole, the view re-attaches past two pages, and a revert waits for its conversation", async () => {
    const pi = await createPiTestRuntime();
    const root = mkdtempSync(join(tmpdir(), "sn-file-"));
    dirs.push(root);
    const settings = SettingsManager.inMemory();
    const file = await openFile({
      sessionId: "s1",
      path: join(root, "s1", "session.sqlite"),
      cwd: pi.defaultProjectRoot,
      modelRuntime: pi.modelRuntime,
      settings: () => settings,
      resources: () => ({contextFiles: [], skills: []}),
      extensions: () => [],
    });
    const frames: TranscriptFrame[] = [];
    const model = {provider: selectedPiModel.provider, modelId: selectedPiModel.id, thinkingLevel: "off"};
    const send = async (text: string) => {
      pi.faux.setResponses([fauxAssistantMessage(`Response to ${text}`)]);
      const sent = await file.send({content: text, contentParts: [{type: "text", text}], captureCheckpoint: false, model}, ctx);
      expect((await sent.answered()).status).toBe("done");
    };
    const following = await file.transcript.follow({advance: (call) => void (call.kind === "value" && frames.push(call.value)), end: () => undefined}, ctx);
    try {
      // 40 turns in the one commit a fork's seed writes: 80 entries, past the 50 a default view starts with.
      const entries: EntryRecord[] = [];
      for (let turn = 1; turn <= 40; turn++) {
        const id = 2 * turn - 1;
        const data = {contentParts: [{type: "text", text: `Request ${turn}`}], turnIndex: turn - 1};
        entries.push(
          {id, conversationId: 1, kind: USER_ENTRY_KIND, model: [{role: "user", content: `Request ${turn}`, timestamp: 0}], data} as unknown as EntryRecord,
          {id: id + 1, conversationId: 1, kind: "pi.assistant", model: [fauxAssistantMessage(`Answer ${turn}`)]} as unknown as EntryRecord
        );
      }
      await file.seed({entries, checkpoints: {}}, ctx);

      const userCount = (entries: readonly EntryRecord[]) => entries.filter((entry) => entry.kind === USER_ENTRY_KIND).length;
      // Each page of new turns attaches the view again, from the newest page and the turn before it.
      await waitUntil(() => expect(userCount(frames.at(-1)?.view.entries ?? [])).toBe(21));
      expect(frames.at(-1)!.view.entries[0]?.kind).toBe(USER_ENTRY_KIND);
      await send("Forty-one");
      await waitUntil(() => expect(userCount(frames.at(-1)!.view.entries)).toBe(22));

      const emitted = frames.length;
      await file.navigate(false, () => 10, ctx);
      await waitUntil(() => expect(frames.length).toBeGreaterThan(emitted));
      const reverted = frames.at(-1)!;
      expect(reverted.state.redoConversation).toBe(1);
      expect(frames.slice(emitted).every((frame) => frame.view.conversation.id === reverted.state.conversation)).toBe(true);
      expect(userCount(reverted.view.entries)).toBe(10);
      expect(reverted.view.before).toBeUndefined();
      expect(userCount(reverted.undone)).toBe(21);
      expect(reverted.undone[0]!.id).toBeGreaterThan(reverted.view.entries.at(-1)!.id);
      expect(await file.transcript.currentFrame(ctx)).toBe(frames.at(-1));
    } finally {
      following.detach();
      await file.close(ctx);
      await pi.unregister();
    }
  });

  it("runs a tool turn and builds its document from Pi's entries", async () => {
    const root = mkdtempSync(join(tmpdir(), "sn-store-"));
    const project = mkdtempSync(join(tmpdir(), "sn-project-"));
    dirs.push(root, project);
    writeFileSync(join(project, "hello.txt"), "hi there\n");
    const modelRuntime = await ModelRuntime.create({modelsPath: null});
    const faux = registerFauxProvider({
      api: "faux:smoke" as Api,
      provider: "anthropic",
      models: [{id: "m", name: "M", reasoning: false, contextWindow: 100000, maxTokens: 1000, input: ["text"], cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0}}],
    });
    const model = faux.getModel();
    modelRuntime.registerProvider("anthropic", {
      api: faux.api as Api,
      apiKey: "k",
      baseUrl: model.baseUrl,
      models: faux.models.map((m) => ({...m, reasoning: false})),
      name: "Anthropic",
    });
    await modelRuntime.refresh({allowNetwork: false});
    let systemPrompt = "";
    faux.setResponses([
      (context) => {
        systemPrompt = JSON.stringify(context.messages.find((m) => m.role === "system"));
        return fauxAssistantMessage(fauxToolCall("read", {path: "hello.txt"}), {stopReason: "toolUse"});
      },
      fauxAssistantMessage("It says hi."),
    ]);
    const record = {id: "s1", updatedAt: new Date(0).toISOString()};
    const file = await openFile({
      sessionId: "s1",
      path: join(root, "s1", "session.sqlite"),
      cwd: project,
      modelRuntime,
      settings: () => SettingsManager.inMemory(),
      resources: () => ({contextFiles: [], skills: []}),
      extensions: () => [],
    });
    const sent = await file.send(
      {
        content: "What does hello.txt say?",
        contentParts: [{type: "text", text: "What does hello.txt say?"}],
        captureCheckpoint: false,
        model: {provider: "anthropic", modelId: "m", thinkingLevel: "off"},
      },
      ctx
    );
    expect((await sent.answered()).status).toBe("done");
    const snapshot = await documentOf(file, record);
    const [user] = snapshot.entries.items;
    expect(snapshot.entries.items.map((entry) => entry.kind)).toEqual([USER_ENTRY_KIND, "pi.assistant", "pi.tool-result", "pi.assistant"]);
    expect(userEntryData(user)).toEqual({contentParts: [{type: "text", text: "What does hello.txt say?"}], turnIndex: 0});
    expect(snapshot).not.toHaveProperty("turns");
    expect(snapshot.entries.items[2]?.model?.[0]).toMatchObject({role: "toolResult", toolName: "read", content: [{type: "text", text: "hi there\n"}]});
    expect(systemPrompt).toContain("read: Read file contents");
    await file.recordAfterTurnCheckpoints(ctx);
    expect((await file.transcript.currentFrame(ctx)).state.checkpoints[String(user!.id)]?.after).toMatchObject({status: "disabled"});
    await file.close(ctx);
    faux.unregister();
  });
});
