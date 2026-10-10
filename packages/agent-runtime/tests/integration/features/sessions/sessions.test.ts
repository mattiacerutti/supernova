import {existsSync} from "node:fs";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {assistantTexts, createPiTestRuntime, fauxAssistantMessage, selectedModelReference, selectedPiModel, turnContents, turnIds} from "@tests/support/session-runtime";

describe("sessions", () => {
  const runtimes: Array<{unregister: () => Promise<void>}> = [];

  afterEach(async () => {
    while (runtimes.length > 0) await runtimes.pop()?.unregister();
  });

  it("creates a persisted empty session under the client's id and rejects a second one with it", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);

    const session = await pi.sessions.create({id: "client-chosen-id", projectPath: "/workspace"});

    expect(session).toMatchObject({id: "client-chosen-id", projectPath: "/workspace", title: "Untitled session", entries: []});
    expect(existsSync(join(pi.sessionStorageRoot, "client-chosen-id", "session.sqlite"))).toBe(true);
    expect(await pi.store.find("client-chosen-id")).toMatchObject({projectPath: "/workspace"});
    await expect(pi.sessions.create({id: "client-chosen-id", projectPath: "/workspace"})).rejects.toMatchObject({
      _tag: "CreateSessionError",
      message: "A session with this id already exists.",
    });
  });

  it("deletes the session file and its record", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const session = await pi.sessions.create({id: crypto.randomUUID(), projectPath: "/workspace"});

    await pi.sessions.delete({sessionId: session.id});

    expect(existsSync(join(pi.sessionStorageRoot, session.id))).toBe(false);
    expect(await pi.store.find(session.id)).toBeUndefined();
  });

  it("renames a session; the generated title never replaces a rename", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();

    const session = await pi.sessions.rename({sessionId: info.id, title: "Investigate flaky tests"});
    await pi.appendConversation(info.id);

    expect(session).toMatchObject({id: info.id, title: "Investigate flaky tests"});
    expect(await pi.sessions.get({sessionId: info.id})).toMatchObject({title: "Investigate flaky tests"});
    await expect(pi.sessions.rename({sessionId: info.id, title: "  "})).rejects.toMatchObject({_tag: "RenameSessionError"});
  });

  it("loads the full history, keeping compaction summaries where they happened", async () => {
    const pi = await createPiTestRuntime({settings: {compaction: {enabled: false}}});
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id, {assistantText: "Original answer", requestText: "Before compaction"});
    await pi.appendConversation(info.id, {assistantText: "Large answer", requestText: "x".repeat(selectedPiModel.contextWindow * 4)});
    pi.faux.setResponses([fauxAssistantMessage("Summary of the work")]);
    await pi.sessionRuntime.compact({modelReference: selectedModelReference, sessionId: info.id});
    await pi.appendConversation(info.id, {assistantText: "Recent answer", requestText: "After compaction"});

    const session = await pi.sessions.get({sessionId: info.id});

    expect(session.title).toBe("Generated title");
    expect(turnContents(session).map((parts) => parts[0])).toEqual([
      {text: "Before compaction", type: "text"},
      {text: "x".repeat(selectedPiModel.contextWindow * 4), type: "text"},
      {text: "After compaction", type: "text"},
    ]);
    expect(session.entries.map((entry) => entry.kind)).toEqual(["pi.user", "pi.assistant", "pi.user", "pi.assistant", "pi.compaction", "pi.user", "pi.assistant"]);
    expect(JSON.stringify(session.entries[4])).toContain("Summary of the work");
    expect(assistantTexts(session)).toEqual(["Original answer", "Large answer", "Recent answer"]);
  });

  it("refreshes credentials and model metadata before listing models", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);

    const models = await pi.sessions.listModels({projectPath: "/workspace"});

    expect(pi.refreshCount).toBe(1);
    expect(models).toEqual(expect.arrayContaining([expect.objectContaining({id: "claude-sonnet", name: "Claude Sonnet", providerId: "anthropic", providerName: "Anthropic"})]));
  });
});

describe("forking a session", () => {
  const runtimes: Array<{unregister: () => Promise<void>}> = [];

  afterEach(async () => {
    while (runtimes.length > 0) await runtimes.pop()?.unregister();
  });

  async function sessionWithTwoTurns() {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.sessions.rename({sessionId: info.id, title: "Original title"});
    await pi.appendConversation(info.id, {requestText: "First", assistantText: "First answer"});
    await pi.appendConversation(info.id, {requestText: "Second", assistantText: "Second answer"});
    return {pi, sessionId: info.id, turnIds: turnIds(await pi.sessions.get({sessionId: info.id}))};
  }

  it("copies the conversation through the chosen turn into a new session and leaves the source intact", async () => {
    const {pi, sessionId, turnIds} = await sessionWithTwoTurns();

    const fork = await pi.sessions.fork({sessionId, turnId: turnIds[0]!});

    expect(fork.id).not.toBe(sessionId);
    expect(fork).toMatchObject({
      forked: true,
      title: "Original title",
      undone: [],
      agent: {model: {modelId: selectedModelReference.id, provider: selectedModelReference.providerId}, thinkingLevel: "high"},
    });
    expect(turnContents(fork)).toEqual([[{text: "First", type: "text"}]]);
    expect(turnContents(await pi.sessions.get({sessionId}))).toHaveLength(2);
    expect((await pi.projects.listSessions({projectPath: pi.defaultProjectRoot, limit: 10})).sessions.map((session) => session.id)).toContain(fork.id);

    // The fork continues on its own with the copied history as context.
    let providerTexts: string[] = [];
    pi.faux.setResponses([
      (context) => {
        providerTexts = context.messages.flatMap((message) => (message.role === "user" && typeof message.content === "string" ? [message.content] : []));
        return fauxAssistantMessage("Forked answer");
      },
    ]);
    await pi.sendMessage({message: "Fork continues", modelReference: selectedModelReference, sessionId: fork.id});
    expect(providerTexts).toEqual(["First", "Fork continues"]);
  });

  it("rejects a turn that is not in the session", async () => {
    const {pi, sessionId} = await sessionWithTwoTurns();

    await expect(pi.sessions.fork({sessionId, turnId: "missing"})).rejects.toMatchObject({_tag: "ForkSessionError"});
  });
});
