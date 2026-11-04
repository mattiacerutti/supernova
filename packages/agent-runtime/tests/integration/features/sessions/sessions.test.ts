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

    const projectPath = pi.defaultProjectRoot;
    const session = await pi.sessions.create({id: "client-chosen-id", projectPath: `${projectPath}/child/..`});

    expect(session).toMatchObject({id: "client-chosen-id", entries: {items: []}});
    expect(await pi.sessions.record({sessionId: "client-chosen-id"})).toMatchObject({projectPath, title: "Untitled session"});
    expect(existsSync(join(pi.sessionStorageRoot, "client-chosen-id", "session.sqlite"))).toBe(true);
    expect(await pi.store.find("client-chosen-id")).toMatchObject({projectPath});
    expect((await pi.list(join(projectPath, "."), 5)).map((item) => item.id)).toEqual(["client-chosen-id"]);
    await expect(pi.sessions.create({id: "client-chosen-id", projectPath})).rejects.toMatchObject({
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

    await pi.sessions.rename({sessionId: info.id, title: "Investigate flaky tests"});
    await pi.appendConversation(info.id);

    expect(await pi.sessions.record({sessionId: info.id})).toMatchObject({id: info.id, title: "Investigate flaky tests"});
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

    expect(await pi.sessions.record({sessionId: info.id})).toMatchObject({title: "Generated title"});
    expect(turnContents(session).map((parts) => parts[0])).toEqual([
      {text: "Before compaction", type: "text"},
      {text: "x".repeat(selectedPiModel.contextWindow * 4), type: "text"},
      {text: "After compaction", type: "text"},
    ]);
    expect(session.entries.items.map((entry) => entry.kind)).toEqual(["pi.user", "pi.assistant", "pi.user", "pi.assistant", "pi.compaction", "pi.user", "pi.assistant"]);
    expect(JSON.stringify(session.entries.items[4])).toContain("Summary of the work");
    expect(assistantTexts(session)).toEqual(["Original answer", "Large answer", "Recent answer"]);
  });

  it("keeps every committed turn of a history longer than the engine's window, across compaction and revert", async () => {
    // Each turn commits a user and an assistant entry, so 60 turns overflow the engine's window (50 to 100 entries) and
    // make it drop its oldest entries in one splice; the session's history must still have them all.
    const pi = await createPiTestRuntime({settings: {compaction: {enabled: false}}});
    runtimes.push(pi);
    const {info} = await pi.createSession();
    // Turn 30 is larger than the context window, so compaction has older turns to summarize.
    const turns = Array.from({length: 60}, (_, index) => (index === 29 ? "x".repeat(selectedPiModel.contextWindow * 4) : `Request ${index + 1}`));
    for (const [index, requestText] of turns.slice(0, 30).entries()) await pi.appendConversation(info.id, {requestText, assistantText: `Answer ${index + 1}`});
    pi.faux.setResponses([fauxAssistantMessage("Summary of thirty turns")]);
    await pi.sessionRuntime.compact({modelReference: selectedModelReference, sessionId: info.id});
    for (const [index, requestText] of turns.slice(30).entries()) await pi.appendConversation(info.id, {requestText, assistantText: `Answer ${index + 31}`});

    // Pages back through the shown turns from the published page, as a client scrolling up does.
    const everyTurn = async () => {
      const session = await pi.sessions.get({sessionId: info.id});
      let page = session.entries;
      const items = [...page.items];
      while (page.remaining > 0) {
        page = await pi.sessionRuntime.loadHistory({sessionId: info.id, side: "entries", edge: items[0]!.id});
        items.unshift(...page.items);
      }
      return {session, history: {entries: {...page, items}}};
    };
    const texts = (strings: readonly string[]) => strings.map((text) => ({text, type: "text"}));

    // Reopened, the session reads what lies before the engine's window from storage.
    await pi.server.serverHost.hosts.release(info.id);
    await pi.store.release(info.id);
    const {session, history} = await everyTurn();
    expect(session.entries.remaining).toBeGreaterThan(0);
    expect(turnContents(history).map((parts) => parts[0])).toEqual(texts(turns));
    expect(history.entries.items.filter((entry) => entry.kind === "pi.compaction")).toHaveLength(1);
    expect(new Set(history.entries.items.map((entry) => entry.id)).size).toBe(history.entries.items.length);

    // A revert to turn 20, before the compaction, keeps the turns before it and undoes it and the rest, compaction included.
    await pi.sessionRuntime.revertToMessage({sessionId: info.id, turnId: turnIds(history)[19]!});
    const afterRevert = await everyTurn();
    expect(turnContents(afterRevert.history).map((parts) => parts[0])).toEqual(texts(turns.slice(0, 19)));
    expect(afterRevert.history.entries.items.some((entry) => entry.kind === "pi.compaction")).toBe(false);
    expect(afterRevert.session.undone.items.length).toBeGreaterThan(0);

    // Continuing after the revert extends the shortened branch.
    await pi.appendConversation(info.id, {requestText: "After revert", assistantText: "New branch"});
    const continued = await everyTurn();
    expect(turnContents(continued.history).map((parts) => parts[0])).toEqual(texts([...turns.slice(0, 19), "After revert"]));
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
    // The fork's record comes back; its conversation is its own host's, opened as any session's.
    expect(fork).toMatchObject({forked: true, title: "Original title", projectPath: pi.defaultProjectRoot});
    const forked = await pi.sessions.get({sessionId: fork.id});
    expect(forked).toMatchObject({
      undone: {items: []},
      agent: {model: {modelId: selectedModelReference.id, provider: selectedModelReference.providerId}, thinkingLevel: "high"},
    });
    expect(turnContents(forked)).toEqual([[{text: "First", type: "text"}]]);
    expect(turnContents(await pi.sessions.get({sessionId}))).toHaveLength(2);
    expect((await pi.list(pi.defaultProjectRoot, 10)).map((session) => session.id)).toContain(fork.id);

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
