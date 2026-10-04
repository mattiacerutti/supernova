import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {ModelRuntime, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {Api} from "@earendil-works/pi-ai/compat";
import {fauxAssistantMessage, fauxToolCall, registerFauxProvider} from "@earendil-works/pi-ai/compat";
import {afterEach, describe, expect, it, vi} from "vitest";
import {SessionStore} from "@supernova/agent-runtime/pi/session-store";
import {createPiTestRuntime, selectedPiModel} from "@tests/support/session-runtime";

describe("session store", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, {recursive: true, force: true});
  });

  it("uses view entries between compactions and repartitions cached leaf history across undo and redo", async () => {
    const pi = await createPiTestRuntime({settings: {compaction: {enabled: false, keepRecentTokens: 1}}});
    try {
      const id = crypto.randomUUID();
      await pi.store.create({id, projectPath: pi.defaultProjectRoot});
      const file = await pi.store.file(id);
      await file.configure({provider: selectedPiModel.provider, modelId: selectedPiModel.id, thinkingLevel: "off"});
      const send = async (text: string) => {
        pi.faux.setResponses([fauxAssistantMessage(`Response to ${text}`)]);
        const submitted = await file.submit({
          content: text,
          record: {contentParts: [{type: "text", text}], capture: false, before: {checkpointId: crypto.randomUUID(), sessionId: id, status: "disabled"}},
        });
        expect((await submitted.wait()).status).toBe("done");
      };

      await send("First");
      const first = await pi.store.snapshot(id);
      const read = vi.spyOn(file, "history");
      await send("Second");
      const second = await pi.store.snapshot(id, {previous: first.history});
      expect(read).not.toHaveBeenCalled();
      expect(second.history.entries.slice(0, first.history.entries.length)).toEqual(first.history.entries);

      await pi.store.show(id, 1, undefined);
      read.mockClear();
      // Deliberately pass a snapshot from before the second turn to exercise catching up an uncached leaf suffix.
      const undone = await pi.store.snapshot(id, {previous: first.history});
      expect(read).toHaveBeenCalledExactlyOnceWith(first.history.leaf, {after: first.history.entries.at(-1)!.id});
      expect(undone.history.entries).toEqual(first.history.entries);
      expect(undone.history.undone).toEqual(second.history.entries.slice(first.history.entries.length));
      read.mockClear();
      expect((await pi.store.snapshot(id, {previous: undone.history})).history).toEqual(undone.history);
      expect(read).not.toHaveBeenCalled();

      await pi.store.show(id, 2, undefined);
      read.mockClear();
      const redone = await pi.store.snapshot(id, {previous: undone.history});
      expect(read).not.toHaveBeenCalled();
      expect(redone.history.entries).toEqual(second.history.entries);
      expect(redone.history.undone).toEqual([]);

      await send("Third");
      pi.faux.setResponses([fauxAssistantMessage("Compacted summary")]);
      await file.compact();
      read.mockClear();
      const compacted = await pi.store.snapshot(id, {previous: redone.history});
      expect(read).toHaveBeenCalledOnce();
      expect(read.mock.calls[0]).toEqual([redone.history.leaf, {after: redone.history.entries.at(-1)!.id, through: compacted.history.entries.at(-1)!.id}]);
      expect(compacted.history.entries.filter((entry) => entry.kind === "pi.user")).toHaveLength(3);
      expect(compacted.history.entries.at(-1)?.kind).toBe("pi.compaction");
      expect((await pi.store.snapshot(id)).history.entries).toEqual(compacted.history.entries);

      await pi.store.show(id, 0, undefined);
      const empty = await pi.store.snapshot(id, {previous: compacted.history});
      expect(empty.history.entries).toEqual([]);
      expect(empty.history.undone).toEqual(compacted.history.entries);
      await pi.store.show(id, 1, undefined);
      read.mockClear();
      const partial = await pi.store.snapshot(id, {previous: empty.history});
      expect(read).not.toHaveBeenCalled();
      expect(partial.history.entries).toEqual(first.history.entries);
      expect(partial.history.undone).toEqual(compacted.history.entries.slice(first.history.entries.length));

      await pi.store.show(id, 2, undefined);
      const twoVisible = await pi.store.snapshot(id, {previous: partial.history});
      pi.faux.setResponses([fauxAssistantMessage("Compacted undo view")]);
      await file.compact();
      const compactedUndo = await pi.store.snapshot(id, {previous: twoVisible.history});
      expect(compactedUndo.history.entries.at(-1)).toMatchObject({kind: "pi.compaction", conversationId: twoVisible.history.visible});
      expect(compactedUndo.history.undone).toEqual(twoVisible.history.undone);
      await pi.store.show(id, 3, undefined);
      read.mockClear();
      const redoAfterCompaction = await pi.store.snapshot(id, {previous: compactedUndo.history});
      expect(read).not.toHaveBeenCalled();
      expect(redoAfterCompaction.history.entries).toEqual(compacted.history.entries);
    } finally {
      await pi.unregister();
    }
  });

  it("runs a tool turn on a session file and builds its document from Pi's entries", async () => {
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
    const store = new SessionStore({
      root,
      sdk: {modelRuntime},
      resourceCache: {load: async () => ({contextFiles: [], skills: [], promptTemplates: [], extensions: {extensions: [], errors: [], runtime: {} as never}})},
      tools: () => [],
      settings: () => SettingsManager.inMemory(),
    });
    await store.create({id: "s1", projectPath: project});
    const session = await store.file("s1");
    const turnModel = {provider: "anthropic", modelId: "m", thinkingLevel: "off"};
    await session.configure(turnModel);
    const before = {checkpointId: "c1", sessionId: "s1", status: "disabled"} as const;
    const submitted = await session.submit({
      content: "What does hello.txt say?",
      record: {contentParts: [{type: "text", text: "What does hello.txt say?"}], capture: false, before},
    });
    expect((await submitted.wait()).status).toBe("done");
    const {session: snapshot} = await store.snapshot("s1");
    const [user] = snapshot.entries;
    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(["pi.user", "pi.assistant", "pi.tool-result", "pi.assistant"]);
    expect(user?.contentParts).toEqual([{type: "text", text: "What does hello.txt say?"}]);
    expect(snapshot).not.toHaveProperty("turns");
    expect(snapshot.entries[2]?.model?.[0]).toMatchObject({role: "toolResult", toolName: "read", content: [{type: "text", text: "hi there\n"}]});
    expect(systemPrompt).toContain("read: Read file contents");
    expect((await session.state()).turns).toMatchObject({[String(user!.id)]: {before: {checkpointId: "c1"}}});
    await store.dispose();
    faux.unregister();
  });
});
