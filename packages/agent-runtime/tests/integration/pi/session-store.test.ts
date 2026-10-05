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
      await pi.store.create({id, projectPath: pi.defaultProjectRoot});
      const file = await pi.store.file(id);
      await file.configure({provider: selectedPiModel.provider, modelId: selectedPiModel.id, thinkingLevel: "off"});
      const send = async (text: string) => {
        await file.diverge();
        pi.faux.setResponses([fauxAssistantMessage(`Response to ${text}`)]);
        const submitted = await file.submit({
          content: text,
          record: {contentParts: [{type: "text", text}], capture: false, before: {checkpointId: crypto.randomUUID(), sessionId: id, status: "disabled"}},
        });
        expect((await submitted.wait()).status).toBe("done");
      };
      const userTexts = (entries: readonly {readonly kind: string; readonly model?: readonly unknown[]}[]) =>
        entries.filter((entry) => entry.kind === "pi.user").map((entry) => (entry.model?.[0] as {content?: unknown} | undefined)?.content);

      await send("First");
      await send("Second");
      const full = await pi.store.snapshot(id);
      const read = vi.spyOn(file, "history");
      // A snapshot after navigation reads no history: the leaf only splits the cached branch.
      const snapshotAt = async (count: number) => {
        await pi.store.show(id, count, undefined);
        read.mockClear();
        const snapshot = await pi.store.snapshot(id, {previous: full.history});
        expect(read).not.toHaveBeenCalled();
        return snapshot.session;
      };

      const undone = await snapshotAt(1);
      expect(userTexts(undone.entries)).toEqual(["First"]);
      expect(userTexts(undone.undone)).toEqual(["Second"]);
      expect((await snapshotAt(0)).entries).toEqual([]);
      expect((await snapshotAt(2)).entries).toEqual(full.session.entries);
      // Undo and redo forked nothing: the root is still the only conversation.
      expect((await file.state()).branch).toBe(1);
      expect(await file.view(2).catch(() => undefined)).toBeUndefined();

      await pi.store.show(id, 1, undefined);
      await send("Branch");
      const state = await file.state();
      expect(state.branch).not.toBe(1);
      expect(state.leaf).toBeUndefined();
      const branched = await pi.store.snapshot(id);
      expect(userTexts(branched.session.entries)).toEqual(["First", "Branch"]);
      expect(branched.session.undone).toEqual([]);

      pi.faux.setResponses([fauxAssistantMessage("Compacted summary")]);
      await file.compact();
      const compacted = await pi.store.snapshot(id, {previous: branched.history});
      expect(compacted.session.entries.at(-1)?.kind).toBe("pi.compaction");
      expect(compacted.session.entries).toEqual((await pi.store.snapshot(id)).session.entries);
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
