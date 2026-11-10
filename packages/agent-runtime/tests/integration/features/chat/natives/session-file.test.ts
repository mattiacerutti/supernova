import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {ModelRuntime, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {Api} from "@earendil-works/pi-ai/compat";
import {fauxAssistantMessage, fauxToolCall, registerFauxProvider} from "@earendil-works/pi-ai/compat";
import {afterEach, describe, expect, it, vi} from "vitest";
import type {SessionFileSetup} from "@supernova/agent-runtime/features/chat/natives/session-file";
import {SessionFile} from "@supernova/agent-runtime/features/chat/natives/session-file";
import {FileCheckpointStore} from "@supernova/agent-runtime/features/chat/natives/checkpoint-store";
import {chatDocument} from "@supernova/agent-runtime/features/chat/lib/transcript/chat-document";
import {createPiTestRuntime, selectedPiModel} from "@tests/support/test-runtime";

async function openFile(setup: SessionFileSetup & {readonly sessionId: string; readonly path: string}) {
  return SessionFile.open({...setup, checkpoints: new FileCheckpointStore(join(setup.path, "..", "checkpoints")), onReport: () => undefined});
}

async function documentOf(file: SessionFile, record: {readonly id: string; readonly updatedAt: string}) {
  const {state, view} = await file.transcript.currentFrame();
  const branchEntries = await file.transcript.branchEntries(view);
  const [agentState, contextUsage] = await Promise.all([file.transcript.agentStateAt(state.branch, state.leaf), file.transcript.contextUsageAt(state.branch, state.leaf)]);
  return chatDocument({record, view, branchEntries, state, agentState, contextUsage});
}

describe("a session file", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, {recursive: true, force: true});
  });

  it("moves only the leaf on undo and redo, and forks once when the agent acts from an undone leaf", async () => {
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
        const sent = await file.send({content: text, contentParts: [{type: "text", text}], captureCheckpoint: false, model});
        expect((await sent.answered()).status).toBe("done");
      };
      const userTexts = (entries: readonly {readonly kind: string; readonly model?: readonly unknown[]}[]) =>
        entries.filter((entry) => entry.kind === "pi.user").map((entry) => (entry.model?.[0] as {content?: unknown} | undefined)?.content);
      // The transcript's only storage read.
      const read = vi.spyOn(file.transcript as unknown as {readMissingEntries: () => Promise<unknown>}, "readMissingEntries");

      await send("First");
      await send("Second");
      const full = await documentOf(file, record);
      // Moving the undo point reads no storage: it only splits the cached entries.
      const documentAfter = async (activeCount: number) => {
        await file.moveLeaf(false, () => activeCount);
        read.mockClear();
        const document = await documentOf(file, record);
        expect(read).not.toHaveBeenCalled();
        return document;
      };

      const undone = await documentAfter(1);
      expect(userTexts(undone.entries.items)).toEqual(["First"]);
      expect(userTexts(undone.undone.items)).toEqual(["Second"]);
      expect((await documentAfter(0)).entries.items).toEqual([]);
      expect((await documentAfter(2)).entries).toEqual(full.entries);

      // Sending from an undone leaf forks once; the new branch reuses the cached entries through the fork point.
      await documentAfter(1);
      await send("Branch");
      read.mockClear();
      const branched = await documentOf(file, record);
      expect(read).not.toHaveBeenCalled();
      expect(userTexts(branched.entries.items)).toEqual(["First", "Branch"]);
      expect(branched.undone.items).toEqual([]);

      pi.faux.setResponses([fauxAssistantMessage("Compacted summary")]);
      await file.compact(model);
      expect((await documentOf(file, record)).entries.items.at(-1)?.kind).toBe("pi.compaction");
    } finally {
      await file.close();
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
    const sent = await file.send({
      content: "What does hello.txt say?",
      contentParts: [{type: "text", text: "What does hello.txt say?"}],
      captureCheckpoint: false,
      model: {provider: "anthropic", modelId: "m", thinkingLevel: "off"},
    });
    expect((await sent.answered()).status).toBe("done");
    const snapshot = await documentOf(file, record);
    const [user] = snapshot.entries.items;
    expect(snapshot.entries.items.map((entry) => entry.kind)).toEqual(["pi.user", "pi.assistant", "pi.tool-result", "pi.assistant"]);
    expect(user?.contentParts).toEqual([{type: "text", text: "What does hello.txt say?"}]);
    expect(snapshot).not.toHaveProperty("turns");
    expect(snapshot.entries.items[2]?.model?.[0]).toMatchObject({role: "toolResult", toolName: "read", content: [{type: "text", text: "hi there\n"}]});
    expect(systemPrompt).toContain("read: Read file contents");
    await file.recordAfterTurnCheckpoints();
    expect((await file.transcript.currentFrame()).state.turns[String(user!.id)]?.after).toMatchObject({status: "disabled"});
    await file.close();
    faux.unregister();
  });
});
