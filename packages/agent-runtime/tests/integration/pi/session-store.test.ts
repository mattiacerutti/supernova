import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {ModelRuntime, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {Api} from "@earendil-works/pi-ai/compat";
import {fauxAssistantMessage, fauxToolCall, registerFauxProvider} from "@earendil-works/pi-ai/compat";
import {afterEach, describe, expect, it} from "vitest";
import {SessionStore} from "@supernova/agent-runtime/pi/session-store";

describe("session store", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, {recursive: true, force: true});
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
    expect(snapshot.turns).toEqual({[String(user!.id)]: {contentParts: [{type: "text", text: "What does hello.txt say?"}]}});
    expect(snapshot.entries[2]?.model?.[0]).toMatchObject({role: "toolResult", toolName: "read", content: [{type: "text", text: "hi there\n"}]});
    expect(systemPrompt).toContain("read: Read file contents");
    expect((await session.state()).turns).toMatchObject({[String(user!.id)]: {before: {checkpointId: "c1"}}});
    await store.dispose();
    faux.unregister();
  });
});
