import type {Session} from "@supernova/contracts/services/sessions/schemas";
import {FoldersService} from "@supernova/contracts/services/folders/services";
import {ProjectsService} from "@supernova/contracts/services/projects/services";
import {RUNTIME_HOST} from "@supernova/contracts/lib/protocol";
import {SessionRuntimeService} from "@supernova/contracts/services/session-runtime/services";
import {SessionsService} from "@supernova/contracts/services/sessions/services";
import {TerminalService, WorkspaceService} from "@supernova/contracts/services/workspace/services";
import {Configuration} from "@supernova/agent-runtime/features/configuration/configuration";
import {Folders} from "@supernova/agent-runtime/features/folders/folders";
import {LoginSessions} from "@supernova/agent-runtime/features/providers/login/login-sessions";
import {Providers} from "@supernova/agent-runtime/features/providers/providers";
import {spawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {Terminals} from "@supernova/agent-runtime/features/workspace/terminals/terminals";
import {Workspace} from "@supernova/agent-runtime/features/workspace/workspace";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {Worktrees} from "@supernova/agent-runtime/features/worktrees/worktrees";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";
import {assistantTexts, createPiTestRuntime, fauxAssistantMessage, selectedModelReference, turnContents, waitUntil} from "@tests/support/session-runtime";
import {startRuntimeServer} from "@tests/support/runtime-server";
import {shellCommand, testShell} from "@tests/support/terminal";

const firstMessage = {contentParts: [{text: "Hi", type: "text" as const}], modelReference: selectedModelReference};
const at = {at: RUNTIME_HOST};

describe("runtime services over the wire", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  /** The runtime's services on a Chord host, and a client host connected to it over a link. */
  async function connect() {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());
    const terminals = new Terminals({spawnPty});
    cleanups.push(() => terminals.dispose());
    // Every service the edge serves needs its feature; the ones these tests never call are inert.
    const runtime = {
      configuration: new Configuration(),
      extensions: {} as AgentRuntime["extensions"],
      folders: new Folders(),
      projects: pi.projects,
      providers: new Providers({loginSessions: new LoginSessions(), sdk: pi.sdk}),
      sessionRuntime: pi.sessionRuntime,
      sessions: pi.sessions,
      workspace: new Workspace({terminals}),
      worktrees: new Worktrees(),
    } as AgentRuntime;
    const server = startRuntimeServer(runtime);
    cleanups.push(server.close);
    const sessions = server.client.get(SessionsService, {}, at);
    const workspace = server.client.get(WorkspaceService, {}, at);
    // A remote state member holds a value only while subscribed, as the app's views are.
    for (const stop of [sessions.directory.subscribe(() => undefined), workspace.terminals.subscribe(() => undefined)]) cleanups.push(async () => stop());
    await sessions.ready;
    /** Holds a session's runtime service, as a page following it does. */
    const hold = async (sessionId: string) => {
      const sessionRuntime = server.client.get(SessionRuntimeService, {sessionId}, at);
      await sessionRuntime.ready;
      // In a record: a handle answers members by name, so awaiting one directly would look for its `then`.
      return {sessionRuntime};
    };
    return {
      hold,
      folders: server.client.get(FoldersService, {}, at),
      pi,
      projects: server.client.get(ProjectsService, {}, at),
      server,
      sessions,
      workspace,
    };
  }

  it("creates a session, runs its turn, and replicates its transcript to a client holding it", async () => {
    const {hold, pi, sessions} = await connect();
    pi.faux.setResponses([fauxAssistantMessage("Hello!"), fauxAssistantMessage("Again.")]);

    const created = await sessions.create({id: "wire-session", message: firstMessage, projectPath: pi.defaultProjectRoot});
    expect(created.ok && turnContents(created.value)).toEqual([firstMessage.contentParts]);

    const {sessionRuntime} = await hold("wire-session");
    const seen: Session[] = [];
    const stop = sessionRuntime.session.subscribe((value) => void (value && seen.push(value)));
    try {
      await pi.settled("wire-session");
      await waitUntil(async () => expect(sessionRuntime.session.value).toEqual(await pi.sessions.get({sessionId: "wire-session"})));
      expect(assistantTexts(sessionRuntime.session.value!)).toEqual(["Hello!"]);

      // A command streams back through the same replicated state, and its turn arrives before the send resolves: the
      // client shows a sent message until then.
      expect(await sessionRuntime.sendMessage({contentParts: [{text: "More", type: "text"}], modelReference: selectedModelReference})).toEqual({
        ok: true,
        value: null,
      });
      expect(turnContents(sessionRuntime.session.value!)).toEqual([firstMessage.contentParts, [{text: "More", type: "text"}]]);
      await pi.settled("wire-session");
      await waitUntil(async () => expect(sessionRuntime.session.value).toEqual(await pi.sessions.get({sessionId: "wire-session"})));
      expect(assistantTexts(sessionRuntime.session.value!)).toEqual(["Hello!", "Again."]);
      expect(seen.some((value) => value.live.run !== undefined)).toBe(true);
    } finally {
      stop();
    }

    await waitUntil(() =>
      expect(sessions.directory.value?.sessions["wire-session"]).toMatchObject({activity: "idle", projectPath: pi.defaultProjectRoot, summary: {id: "wire-session"}})
    );
  });

  it("publishes the connection to an oversized turn when a send moves it outside the live window", async () => {
    const {hold, pi} = await connect();
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id, {assistantText: "x".repeat(6 * 1024 * 1024)});
    const {sessionRuntime} = await hold(info.id);
    const stop = sessionRuntime.session.subscribe(() => undefined);
    try {
      await waitUntil(async () => expect(sessionRuntime.session.value).toEqual(await pi.sessions.get({sessionId: info.id})));
      const before = sessionRuntime.session.value!.entries;
      expect(before.remaining).toBe(0);
      pi.faux.setResponses([fauxAssistantMessage("Next answer.")]);

      expect(await sessionRuntime.sendMessage({contentParts: [{text: "Next prompt", type: "text"}], modelReference: selectedModelReference})).toEqual({ok: true, value: null});

      const after = sessionRuntime.session.value!.entries;
      expect(after).toMatchObject({remaining: 1, precedingEntryId: before.items.at(-1)!.id});
      expect(after.items[0]!.contentParts).toEqual([{text: "Next prompt", type: "text"}]);
      expect(after.items.some((entry) => entry.id === before.items[0]!.id)).toBe(false);
      const page = await sessionRuntime.loadHistory({side: "entries", edge: after.items[0]!.id});
      expect(page).toEqual({ok: true, value: before});
      await pi.settled(info.id);
    } finally {
      stop();
    }
  });

  it("serves a session again after every client released it, from its current document", async () => {
    const {hold, pi, sessions} = await connect();
    pi.faux.setResponses([fauxAssistantMessage("First."), fauxAssistantMessage("Second.")]);
    await sessions.create({id: "released", message: firstMessage, projectPath: pi.defaultProjectRoot});

    await pi.settled("released");
    const first = await hold("released");
    expect(await first.sessionRuntime.sendMessage({contentParts: [{text: "More", type: "text"}], modelReference: selectedModelReference})).toEqual({ok: true, value: null});
    first.sessionRuntime.release();
    // The session's work runs on without a client.
    await pi.settled("released");

    const {sessionRuntime} = await hold("released");
    const stop = sessionRuntime.session.subscribe(() => undefined);
    try {
      await waitUntil(async () => expect(sessionRuntime.session.value).toEqual(await pi.sessions.get({sessionId: "released"})));
      expect(assistantTexts(sessionRuntime.session.value!)).toEqual(["First.", "Second."]);
    } finally {
      stop();
    }
  });

  it("pages and searches a project's sessions, and pins one for every client", async () => {
    const {pi, projects, sessions} = await connect();
    for (const id of ["first", "second", "third"]) await sessions.create({id, projectPath: pi.defaultProjectRoot});
    await sessions.rename({sessionId: "second", title: "Fix the login"});

    const firstPage = await projects.listSessions({projectPath: pi.defaultProjectRoot, limit: 2});
    expect(firstPage.ok && firstPage.value.sessions).toHaveLength(2);
    const nextCursor = firstPage.ok ? firstPage.value.nextCursor : null;
    expect(nextCursor).not.toBeNull();
    const lastPage = await projects.listSessions({projectPath: pi.defaultProjectRoot, limit: 2, cursor: nextCursor!});
    expect(lastPage).toMatchObject({ok: true, value: {nextCursor: null}});

    expect(await projects.searchSessions({query: "LOGIN", projectPaths: [pi.defaultProjectRoot], limit: 10})).toMatchObject({
      ok: true,
      value: {sessions: [{id: "second", projectPath: pi.defaultProjectRoot, title: "Fix the login"}], nextCursor: null},
    });

    expect(await projects.pinSession({sessionId: "first", pinned: true})).toEqual({ok: true, value: null});
    // The pin reaches every client through the directory, and the listing puts the session first.
    await waitUntil(() => expect(sessions.directory.value?.sessions.first?.summary).toMatchObject({pinned: true}));
    expect(await projects.listSessions({projectPath: pi.defaultProjectRoot, limit: 1})).toMatchObject({
      ok: true,
      value: {sessions: [{id: "first", pinned: true}]},
    });
    // An invalid limit is refused at the boundary.
    expect(await projects.listSessions({projectPath: pi.defaultProjectRoot, limit: 0})).toMatchObject({ok: false, error: {code: "GenericError"}});
  });

  it("returns declared contract errors by tag, and every other failure as a GenericError", async () => {
    const {hold, pi, sessions} = await connect();
    pi.faux.setResponses([fauxAssistantMessage("one")]);
    await sessions.create({id: "errors", message: firstMessage, projectPath: pi.defaultProjectRoot});
    await pi.settled("errors");
    const {sessionRuntime} = await hold("errors");

    // A plain error thrown by a checkpoint method is undeclared, so it is a GenericError, never a declared one such as
    // CheckpointConflictError (which would offer to discard changes).
    expect(await sessionRuntime.redoCheckpoint({})).toEqual({ok: false, error: {code: "GenericError", message: "No checkpoint is available to redo."}});
    expect(await sessionRuntime.sendMessage({contentParts: [{text: "x", type: "text"}], modelReference: {...selectedModelReference, id: "missing-model"}})).toEqual({
      ok: false,
      error: {code: "GenericError", message: "Selected model is not available."},
    });
    // A declared error keeps its own tag and message.
    expect(await sessions.rename({sessionId: "errors", title: " "})).toEqual({
      ok: false,
      error: {code: "RenameSessionError", message: "Session title cannot be empty."},
    });
    // Holding an unknown session fails.
    await expect(hold("unknown")).rejects.toThrow("Session not found.");
    expect(await sessionRuntime.abort(null)).toEqual({ok: true, value: null});
  });

  it("serves the non-session services: calls return results or tagged errors", async () => {
    const {folders, pi, workspace} = await connect();

    const created = await folders.create({path: `${pi.defaultProjectRoot}/made-over-the-wire`});
    expect(created).toEqual({ok: true, value: {path: `${pi.defaultProjectRoot}/made-over-the-wire`}});
    // The default project is a plain folder, not a Git repository.
    expect(await workspace.listBranches({projectPath: pi.defaultProjectRoot})).toMatchObject({ok: false, error: {code: "WorkspaceNotARepositoryError"}});
    // A member of an error union (`WorkspaceFileError`) keeps its own tag.
    expect(await workspace.readFile({path: "../outside", projectPath: pi.defaultProjectRoot})).toMatchObject({
      ok: false,
      error: {code: "WorkspaceFileNotFoundError"},
    });
    // Payloads are validated at the boundary.
    expect(await workspace.readFile({path: 1} as never)).toMatchObject({ok: false, error: {code: "GenericError", message: "The request is invalid."}});
  });

  describe("terminals", () => {
    const originalShell = process.env.SHELL;
    beforeEach(() => {
      process.env.SHELL = testShell;
    });
    afterEach(() => {
      if (originalShell === undefined) delete process.env.SHELL;
      else process.env.SHELL = originalShell;
    });

    it("sends a terminal's output only to clients subscribed to it, and its listing to every client", async () => {
      const {pi, server, workspace} = await connect();
      // A second window: it follows the list of terminals but never shows this one.
      const other = server.connectClient();
      const otherWorkspace = other.host.get(WorkspaceService, {}, at);
      const stopOtherList = otherWorkspace.terminals.subscribe(() => undefined);
      cleanups.push(async () => stopOtherList());

      expect(await workspace.openTerminal({cols: 80, cwd: pi.defaultProjectRoot, id: "wire-terminal", rows: 24, sessionId: "s"})).toMatchObject({
        ok: true,
        value: {id: "wire-terminal", number: 1},
      });
      await waitUntil(() => expect(otherWorkspace.terminals.value?.terminals["wire-terminal"]).toMatchObject({sessionId: "s"}));

      const terminal = server.client.get(TerminalService, {terminalId: "wire-terminal"}, at);
      const stopOutput = terminal.output.subscribe(() => undefined);
      cleanups.push(async () => stopOutput());
      await terminal.ready;
      await terminal.write({data: shellCommand("echo WIRE_$((20+1))", "node -p \"'WIRE_' + (20+1)\"")});
      await waitUntil(() => expect(terminal.output.value?.output).toContain("WIRE_21"), {timeoutMs: 5_000});
      // The listing carries no output, and the window that never subscribed received none.
      expect(JSON.stringify(otherWorkspace.terminals.value)).not.toContain("WIRE_21");
      expect(other.received.join("\n")).not.toContain("WIRE_21");
    });

    it("replays history to a client that attaches later, applies the last resize, and ends the output on close", async () => {
      const {pi, server, workspace} = await connect();
      await workspace.openTerminal({cols: 80, cwd: pi.defaultProjectRoot, id: "shared", rows: 24, sessionId: "s"});
      const first = server.client.get(TerminalService, {terminalId: "shared"}, at);
      const stopFirst = first.output.subscribe(() => undefined);
      cleanups.push(async () => stopFirst());
      await first.write({data: shellCommand("echo EARLY_$((1+1))", "node -p \"'EARLY_' + (1+1)\"")});
      await waitUntil(() => expect(first.output.value?.output).toContain("EARLY_2"), {timeoutMs: 5_000});

      const other = server.connectClient().host.get(TerminalService, {terminalId: "shared"}, at);
      const stopOther = other.output.subscribe(() => undefined);
      cleanups.push(async () => stopOther());
      await waitUntil(() => expect(other.output.value?.output).toContain("EARLY_2"));

      // Whoever resizes last sets the shell's size.
      await first.resize({cols: 100, rows: 30});
      await other.resize({cols: 90, rows: 20});
      await other.write({data: shellCommand("stty size", "node -p \"process.stdout.rows + ' ' + process.stdout.columns\"")});
      await waitUntil(() => expect(first.output.value?.output).toContain("20 90"), {timeoutMs: 5_000});

      expect(await workspace.closeTerminal({id: "shared"})).toEqual({ok: true, value: null});
      await waitUntil(() => expect(other.output.value?.closed).toBe(true));
      expect(await other.write({data: "x"})).toMatchObject({ok: false, error: {code: "TerminalNotFoundError"}});
    });

    it("fails to hold an unknown terminal", async () => {
      const {server} = await connect();
      const missing = server.client.get(TerminalService, {terminalId: "missing"}, at);
      await expect(missing.ready).rejects.toThrow("Terminal not found.");
    });
  });
});
