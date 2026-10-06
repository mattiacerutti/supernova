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

  it("moves only the leaf on undo and redo, and forks once when the agent acts from an undone leaf", async () => {
    const pi = await createPiTestRuntime({settings: {compaction: {enabled: false, keepRecentTokens: 1}}});
    try {
      const id = crypto.randomUUID();
      const record = await pi.store.create({id, projectPath: pi.defaultProjectRoot});
      const file = await pi.store.file(id);
      const model = {provider: selectedPiModel.provider, modelId: selectedPiModel.id, thinkingLevel: "off"};
      const send = async (text: string) => {
        pi.faux.setResponses([fauxAssistantMessage(`Response to ${text}`)]);
        const submitted = await file.send({
          content: text,
          record: {contentParts: [{type: "text", text}], capture: false, before: {checkpointId: crypto.randomUUID(), sessionId: id, status: "disabled"}},
          model,
        });
        expect((await submitted.wait()).status).toBe("done");
      };
      const userTexts = (entries: readonly {readonly kind: string; readonly model?: readonly unknown[]}[]) =>
        entries.filter((entry) => entry.kind === "pi.user").map((entry) => (entry.model?.[0] as {content?: unknown} | undefined)?.content);
      // Every engine read of entries goes through the file's private `history`; spying on it counts SQLite reads.
      const read = vi.spyOn(file as unknown as {history: () => Promise<unknown>}, "history");

      await send("First");
      await send("Second");
      const full = await file.snapshot(record);
      // Navigation and the snapshot after it read no history: the leaf only splits the cached branch.
      const snapshotAt = async (count: number) => {
        read.mockClear();
        await file.show((await file.navigation()).turns, count, undefined);
        const snapshot = await file.snapshot(record);
        expect(read).not.toHaveBeenCalled();
        return snapshot;
      };

      const undone = await snapshotAt(1);
      expect(userTexts(undone.entries)).toEqual(["First"]);
      expect(userTexts(undone.undone)).toEqual(["Second"]);
      expect((await snapshotAt(0)).entries).toEqual([]);
      expect((await snapshotAt(2)).entries).toEqual(full.entries);

      // Sending from an undone leaf forks once; the new branch reuses the cache through the fork point.
      await snapshotAt(1);
      await send("Branch");
      read.mockClear();
      const branched = await file.snapshot(record);
      expect(read).not.toHaveBeenCalled();
      expect(userTexts(branched.entries)).toEqual(["First", "Branch"]);
      expect(branched.undone).toEqual([]);
      expect((await pi.store.file(id)) === file).toBe(true);

      pi.faux.setResponses([fauxAssistantMessage("Compacted summary")]);
      await file.compact(model);
      expect((await file.snapshot(record)).entries.at(-1)?.kind).toBe("pi.compaction");
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
    const record = await store.create({id: "s1", projectPath: project});
    const session = await store.file("s1");
    const before = {checkpointId: "c1", sessionId: "s1", status: "disabled"} as const;
    const submitted = await session.send({
      content: "What does hello.txt say?",
      record: {contentParts: [{type: "text", text: "What does hello.txt say?"}], capture: false, before},
      model: {provider: "anthropic", modelId: "m", thinkingLevel: "off"},
    });
    expect((await submitted.wait()).status).toBe("done");
    const snapshot = await session.snapshot(record);
    const [user] = snapshot.entries;
    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(["pi.user", "pi.assistant", "pi.tool-result", "pi.assistant"]);
    expect(user?.contentParts).toEqual([{type: "text", text: "What does hello.txt say?"}]);
    expect(snapshot).not.toHaveProperty("turns");
    expect(snapshot.entries[2]?.model?.[0]).toMatchObject({role: "toolResult", toolName: "read", content: [{type: "text", text: "hi there\n"}]});
    expect(systemPrompt).toContain("read: Read file contents");
    expect(await session.turnRecords()).toMatchObject({[String(user!.id)]: {before: {checkpointId: "c1"}}});
    await store.dispose();
    faux.unregister();
  });
});
