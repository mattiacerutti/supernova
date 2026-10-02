import {existsSync} from "node:fs";
import {mkdir, mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {createPiTestRuntime, fauxAssistantMessage, selectedModelReference, selectedPiModel} from "@tests/support/session-runtime";
import {cleanupTempDirs} from "@tests/support/async";

describe("sessions", () => {
  const runtimes: Array<{unregister: () => Promise<void>}> = [];

  afterEach(async () => {
    while (runtimes.length > 0) await runtimes.pop()?.unregister();
  });

  it("creates a persisted empty session under the client's id and rejects a second one with it", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);

    const session = await pi.sessions.create({id: "client-chosen-id", projectPath: "/workspace"});

    expect(session).toMatchObject({id: "client-chosen-id", projectPath: "/workspace", title: "Untitled session", turns: []});
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

  it("loads turns from the full history, showing compactions where they happened", async () => {
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
    expect(session.turns.map((turn) => turn.userMessage.contentParts[0])).toEqual([
      {text: "Before compaction", type: "text"},
      {text: "x".repeat(selectedPiModel.contextWindow * 4), type: "text"},
      {text: "After compaction", type: "text"},
    ]);
    expect(session.turns[0]?.events).toEqual([expect.objectContaining({content: "Original answer", type: "assistant"})]);
    expect(session.turns[1]?.events).toContainEqual(expect.objectContaining({status: "completed", summary: "Summary of the work", type: "compaction"}));
    expect(session.turns[2]?.events).toEqual([expect.objectContaining({content: "Recent answer", type: "assistant"})]);
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
    const turnIds = (await pi.sessions.get({sessionId: info.id})).turns.map((turn) => turn.id);
    return {pi, sessionId: info.id, turnIds};
  }

  it("copies the conversation through the chosen turn into a new session and leaves the source intact", async () => {
    const {pi, sessionId, turnIds} = await sessionWithTwoTurns();

    const fork = await pi.sessions.fork({sessionId, turnId: turnIds[0]!});

    expect(fork.id).not.toBe(sessionId);
    expect(fork).toMatchObject({forked: true, title: "Original title", undoneTurns: [], modelReference: selectedModelReference});
    expect(fork.turns.map((turn) => turn.userMessage.contentParts)).toEqual([[{text: "First", type: "text"}]]);
    expect((await pi.sessions.get({sessionId})).turns).toHaveLength(2);
    expect((await pi.projects.listSessions({projectPath: pi.defaultProjectRoot})).sessions.map((session) => session.id)).toContain(fork.id);

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

describe("legacy sessions", () => {
  const runtimes: Array<{unregister: () => Promise<void>}> = [];
  const tempDirs: string[] = [];
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

  afterEach(async () => {
    while (runtimes.length > 0) await runtimes.pop()?.unregister();
    cleanupTempDirs(tempDirs);
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  });

  /** A session file as the old runtime wrote it: authored content parts, a user message, and an answer. */
  async function writeLegacySession(id: string): Promise<string> {
    const agentDir = await mkdtemp(join(tmpdir(), "supernova-agent-"));
    tempDirs.push(agentDir);
    process.env.PI_CODING_AGENT_DIR = agentDir;
    const directory = join(agentDir, "sessions", "--workspace--");
    await mkdir(directory, {recursive: true});
    const lines = [
      {type: "session", version: 3, id, timestamp: "2026-01-01T00:00:00.000Z", cwd: "/workspace"},
      {type: "model_change", id: "m1", parentId: null, timestamp: "2026-01-01T00:00:00.500Z", provider: "anthropic", modelId: "claude-sonnet"},
      {
        type: "custom",
        id: "c1",
        parentId: "m1",
        timestamp: "2026-01-01T00:00:01.000Z",
        customType: "supernova.user-message-content-parts",
        data: {contentParts: [{text: "Legacy request", type: "text"}]},
      },
      {type: "message", id: "u1", parentId: "c1", timestamp: "2026-01-01T00:00:01.000Z", message: {role: "user", content: [{type: "text", text: "Legacy request"}], timestamp: 1}},
      {type: "message", id: "a1", parentId: "u1", timestamp: "2026-01-01T00:00:02.000Z", message: fauxAssistantMessage("Legacy answer", {timestamp: 2})},
    ];
    const path = join(directory, `2026-01-01T00-00-00-000Z_${id}.jsonl`);
    await writeFile(path, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
    return path;
  }

  it("shows an old session read-only and rejects changes to it", async () => {
    await writeLegacySession("legacy-1");
    const pi = await createPiTestRuntime();
    runtimes.push(pi);

    const session = await pi.sessions.get({sessionId: "legacy-1"});

    expect(session).toMatchObject({id: "legacy-1", projectPath: "/workspace", title: "Legacy request"});
    expect(session.turns).toMatchObject([{events: [{content: "Legacy answer", type: "assistant"}], userMessage: {contentParts: [{text: "Legacy request", type: "text"}]}}]);
    await expect(pi.sendMessage({message: "More", modelReference: selectedModelReference, sessionId: "legacy-1"})).rejects.toThrow("read-only");
    await expect(pi.sessions.rename({sessionId: "legacy-1", title: "New"})).rejects.toMatchObject({_tag: "RenameSessionError", message: expect.stringContaining("read-only")});
    await expect(pi.sessions.fork({sessionId: "legacy-1", turnId: "u1"})).rejects.toMatchObject({_tag: "ForkSessionError", message: expect.stringContaining("read-only")});
    await expect(pi.sessions.create({id: "legacy-1", projectPath: "/workspace"})).rejects.toMatchObject({_tag: "CreateSessionError"});
  });
});
