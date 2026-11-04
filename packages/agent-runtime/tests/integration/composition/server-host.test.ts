import type {Reference, Watchable} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {FoldersService} from "@supernova/contracts/services/folders/services";
import {ChatService} from "@supernova/contracts/services/session-runtime/services";
import {SessionsService, SessionStatusService} from "@supernova/contracts/services/sessions/services";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import type {SessionsView} from "@supernova/contracts/services/sessions/services";
import {TerminalService, WorkspaceService} from "@supernova/contracts/services/workspace/services";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {assistantTexts, createPiTestRuntime, fauxAssistantMessage, selectedModelReference, turnContents, waitUntil} from "@tests/support/session-runtime";
import {shellCommand, testShell} from "@tests/support/terminal";

const firstMessage = {contentParts: [{text: "Hi", type: "text" as const}], modelReference: selectedModelReference};

type Owned = typeof SessionsService | typeof ChatService | typeof SessionStatusService | typeof WorkspaceService | typeof TerminalService | typeof FoldersService;
type Owner<C extends Owned> = Extract<Reference<C>, {readonly variant: "owner"}>;

function variantOf<C extends Owned>(_type: C, ref: Reference<C>): Owner<C> {
  if (ref.variant !== "owner") throw new Error(`Expected the owner variant, got ${String(ref.variant)}`);
  return ref as Owner<C>;
}

/** A watch of `source` from now on: every value it delivers, in order. */
async function record<T>(source: Watchable<T>) {
  const values: T[] = [];
  const watch = await source.watch(context);
  values.push(watch.value);
  watch.start(async (call) => {
    if (call.kind === "value") values.push(call.value);
  });
  return {values, stop: () => watch.stop()};
}

describe("the server host over the wire", () => {
  const cleanups: Array<() => Promise<unknown>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  async function connect() {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());
    const {server} = pi;
    const owner = server.client;
    const get = async <C extends Owned>(Type: C, params: Parameters<typeof owner.get<C>>[1], host = owner) => {
      const ref = await host.get(Type, params, context);
      cleanups.push(async () => ref.release());
      return variantOf(Type, ref);
    };
    const tab = (host = owner, clientId: string = crypto.randomUUID()) => get(SessionsService, {clientId}, host);
    type Viewed = {readonly view: {readonly value: SessionsView}};
    const shown = async (viewed: Viewed, projectPath: string) => {
      await waitUntil(() => expect(viewed.view.value.projects[projectPath]?.loading).toBe(false));
      return viewed.view.value.projects[projectPath]!;
    };
    const ids = (viewed: Viewed, projectPath: string) => (viewed.view.value.projects[projectPath]?.items ?? []).map((item) => item.id);
    return {get, ids, owner, pi, server, shown, tab, sessions: await tab()};
  }

  it("creates a session, runs its turn on the session's host, and replicates its document to a client holding its chat", async () => {
    const {get, pi, sessions} = await connect();
    pi.faux.setResponses([fauxAssistantMessage("Hello!"), fauxAssistantMessage("Again.")]);

    const created = await sessions.create({id: "wire-session", message: firstMessage, projectPath: pi.defaultProjectRoot}, context);
    expect(created.ok && turnContents(created.value)).toEqual([firstMessage.contentParts]);

    const chat = await get(ChatService, {sessionId: "wire-session"});
    const seen = await record<Session>(chat.session);
    cleanups.push(seen.stop);
    await pi.settled("wire-session");
    await waitUntil(async () => expect(chat.session.value).toEqual(await pi.sessions.get({sessionId: "wire-session"})));
    expect(assistantTexts(chat.session.value)).toEqual(["Hello!"]);

    // A command streams back through the same document, and its turn arrives before the send resolves: the client
    // shows a sent message until then.
    expect(await chat.sendMessage({contentParts: [{text: "More", type: "text"}], modelReference: selectedModelReference}, context)).toEqual({ok: true, value: null});
    await waitUntil(() => expect(turnContents(chat.session.value)).toEqual([firstMessage.contentParts, [{text: "More", type: "text"}]]));
    await pi.settled("wire-session");
    await waitUntil(async () => expect(chat.session.value).toEqual(await pi.sessions.get({sessionId: "wire-session"})));
    expect(assistantTexts(chat.session.value)).toEqual(["Hello!", "Again."]);
    expect(seen.values.some((value) => value.live?.run !== undefined)).toBe(true);
  });

  it("finishes creation and submits the first message after the creating browser disconnects", async () => {
    const {pi, server, tab} = await connect();
    const browser = await server.connectClient();
    const sessions = await tab(browser.host);
    let loaded!: () => void;
    let resume!: () => void;
    const loading = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const load = pi.resourceCache.load.bind(pi.resourceCache);
    const gate = vi.spyOn(pi.resourceCache, "load").mockImplementation(async (cwd) => {
      loaded();
      await paused;
      return load(cwd);
    });
    pi.faux.setResponses([fauxAssistantMessage("Finished without the browser.")]);
    try {
      const creation = sessions.create({id: "disconnected-creator", message: firstMessage, projectPath: pi.defaultProjectRoot}, context);
      const disconnected = expect(creation).rejects.toMatchObject({code: "unavailable"});
      await loading;
      browser.disconnect();
      await disconnected;
      resume();

      await waitUntil(async () => {
        const record = await pi.runtime.store.find("disconnected-creator");
        if (!record) throw new Error("The created session disappeared.");
        const file = await pi.runtime.store.file("disconnected-creator");
        expect(turnContents(await file.snapshot(record))).toEqual([firstMessage.contentParts]);
      });
      await pi.settled("disconnected-creator");
      const returning = await server.connectClient();
      const chat = await returning.host.get(ChatService, {sessionId: "disconnected-creator"}, context);
      cleanups.push(async () => chat.release());
      if (chat.variant !== "owner") throw new Error("Expected the owner's chat.");
      expect(turnContents(chat.session.value)).toEqual([firstMessage.contentParts]);
      expect(assistantTexts(chat.session.value)).toEqual(["Finished without the browser."]);
      expect(await pi.sessions.exists({sessionId: "disconnected-creator"})).toBe(true);
    } finally {
      resume();
      gate.mockRestore();
    }
  });

  it("streams a session's document as edits: appends while it grows, never a whole replacement per partial", async () => {
    const {get, pi} = await connect();
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id);
    const chat = await get(ChatService, {sessionId: info.id});
    const watch = await chat.session.watch(context);
    const ops: (readonly unknown[])[] = [];
    watch.start(async (call) => {
      if (call.kind === "value") ops.push(...call.ops);
    });
    cleanups.push(() => watch.stop());
    pi.faux.setResponses([fauxAssistantMessage(`Streamed. ${"word ".repeat(100)}`)]);

    await pi.sessionRuntime.sendMessage({contentParts: [{text: "Go", type: "text"}], modelReference: selectedModelReference, sessionId: info.id});
    await pi.settled(info.id);
    await waitUntil(async () => expect(chat.session.value).toEqual(await pi.sessions.get({sessionId: info.id})));

    expect(ops.length).toBeGreaterThan(0);
    // No root replacement, and the history pages were not sent again whole.
    expect(ops.some((op) => op[0] === "r")).toBe(false);
    expect(ops.some((op) => op[0] === "s" && JSON.stringify(op[1]) === JSON.stringify(["entries", "items"]))).toBe(false);
  });

  it("keeps the open session's record from the catalog, through a rename and a pin, without its host publishing", async () => {
    const {get, pi, sessions} = await connect();
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id);
    const chat = await get(ChatService, {sessionId: info.id});
    expect(await sessions.openSession({sessionId: info.id}, context)).toEqual({ok: true, value: null});
    await waitUntil(() => expect(sessions.view.value.open).toMatchObject({id: info.id, title: "Generated title", pinned: false}));
    const conversation = await chat.session.watch(context);
    const published: unknown[] = [];
    conversation.start(async (call) => {
      if (call.kind === "value") published.push(call.ops);
    });
    cleanups.push(() => conversation.stop());

    expect(await sessions.rename({sessionId: info.id, title: "Fix login"}, context)).toEqual({ok: true, value: null});
    expect(await sessions.pin({sessionId: info.id, pinned: true}, context)).toEqual({ok: true, value: null});
    await waitUntil(() => expect(sessions.view.value.open).toMatchObject({title: "Fix login", pinned: true, projectPath: pi.defaultProjectRoot}));
    // The conversation carries no copy of the record, so nothing about it changed.
    expect(published.filter((ops) => (ops as readonly unknown[]).length > 0)).toEqual([]);
    expect(chat.session.value).not.toHaveProperty("title");

    // Archived, the record is gone for the page too; closing clears the slot.
    expect(await sessions.archive({projectPath: pi.defaultProjectRoot, sessionId: info.id}, context)).toMatchObject({ok: true});
    await waitUntil(() => expect(sessions.view.value.open).toBeNull());
    expect(await sessions.closeSession(context)).toEqual({ok: true, value: null});
  });

  it("serves a session again after every client released it, from its current document, and its work runs on", async () => {
    const {get, owner, pi, sessions} = await connect();
    pi.faux.setResponses([fauxAssistantMessage("First."), fauxAssistantMessage("Second.")]);
    await sessions.create({id: "released", message: firstMessage, projectPath: pi.defaultProjectRoot}, context);
    await pi.settled("released");

    const first = variantOf(ChatService, await owner.get(ChatService, {sessionId: "released"}, context));
    expect(await first.sendMessage({contentParts: [{text: "More", type: "text"}], modelReference: selectedModelReference}, context)).toEqual({ok: true, value: null});
    first.release();
    // The session's work runs on without a client: its host is kept until release.
    await pi.settled("released");

    const chat = await get(ChatService, {sessionId: "released"});
    await waitUntil(async () => expect(chat.session.value).toEqual(await pi.sessions.get({sessionId: "released"})));
    expect(assistantTexts(chat.session.value)).toEqual(["First.", "Second."]);
  });

  it("runs two sessions on independent hosts", async () => {
    const {get, pi, sessions} = await connect();
    pi.faux.setResponses([fauxAssistantMessage("One."), fauxAssistantMessage("Two.")]);
    await sessions.create({id: "one", message: firstMessage, projectPath: pi.defaultProjectRoot}, context);
    await sessions.create({id: "two", message: firstMessage, projectPath: pi.defaultProjectRoot}, context);
    await pi.settled("one");
    await pi.settled("two");

    const one = await get(ChatService, {sessionId: "one"});
    const two = await get(ChatService, {sessionId: "two"});
    await waitUntil(() => expect([assistantTexts(one.session.value), assistantTexts(two.session.value)]).toEqual([["One."], ["Two."]]));
    const hosts = pi.server.serverHost.hosts;
    expect(hosts.running("one") && hosts.running("two")).toBe(true);
    expect(await hosts.startedHost("one")).not.toBe(await hosts.startedHost("two"));
  });

  it("keeps a shown project's window current: creates, renames, pins and archives, without skipping after a reorder", async () => {
    const {ids, pi, sessions, shown, tab} = await connect();
    const project = pi.defaultProjectRoot;
    for (const id of ["first", "second", "third"]) await sessions.create({id, projectPath: project}, context);
    const list = await tab();
    expect(await list.showProject({projectPath: project, depth: 2}, context)).toEqual({ok: true, value: null});
    expect((await shown(list, project)).items).toHaveLength(2);
    expect((await shown(list, project)).hasMore).toBe(true);

    expect(await sessions.pin({sessionId: "first", pinned: true}, context)).toEqual({ok: true, value: null});
    await waitUntil(() => expect(ids(list, project)[0]).toBe("first"));

    // Loading more after the reorder lists everyone once.
    expect(await list.loadMore({projectPath: project, by: 2}, context)).toEqual({ok: true, value: null});
    await waitUntil(() => expect(list.view.value.projects[project]?.depth).toBe(4));
    expect((await shown(list, project)).items.map((item) => item.id).toSorted()).toEqual(["first", "second", "third"]);
    expect(list.view.value.projects[project]?.hasMore).toBe(false);

    await sessions.create({id: "fourth", projectPath: project}, context);
    await waitUntil(() => expect(ids(list, project)).toContain("fourth"));
    expect(await sessions.archive({projectPath: project, sessionId: "first"}, context)).toMatchObject({ok: true});
    await waitUntil(() => expect(ids(list, project)).not.toContain("first"));
    // An invalid depth is refused at the boundary.
    expect(await list.showProject({projectPath: project, depth: 0}, context)).toMatchObject({ok: false, error: {code: "GenericError"}});
  });

  it("holds a window per shown project in one tab's view, keeps tabs apart, and shares one between references", async () => {
    const {ids, owner, pi, server, sessions, shown, tab} = await connect();
    const [one, two] = [`${pi.defaultProjectRoot}/one`, `${pi.defaultProjectRoot}/two`];
    await sessions.create({id: "a", projectPath: one}, context);
    await sessions.create({id: "b", projectPath: two}, context);

    const list = await tab();
    await list.showProject({projectPath: one, depth: 5}, context);
    await list.showProject({projectPath: two, depth: 5}, context);
    expect((await shown(list, one)).items.map((item) => item.id)).toEqual(["a"]);
    expect((await shown(list, two)).items.map((item) => item.id)).toEqual(["b"]);
    // Hidden, a project leaves the view and stops being kept current.
    await list.hideProject({projectPath: two}, context);
    await waitUntil(() => expect(Object.keys(list.view.value.projects)).toEqual([one]));

    // Another tab's view is its own.
    const other = await tab(owner);
    expect(other.view.value.projects).toEqual({});

    // Two references with one client id, over different links, are one view.
    const clientId = crypto.randomUUID();
    const first = await tab(owner, clientId);
    const second = await tab((await server.connectClient()).host, clientId);
    await first.showProject({projectPath: one, depth: 5}, context);
    await shown(second, one);
    first.release();
    // Still held by the other reference: still kept current.
    await sessions.create({id: "c", projectPath: one}, context);
    await waitUntil(() => expect(ids(second, one).toSorted()).toEqual(["a", "c"]));
  });

  it("searches titles across projects a page at a time, newest first", async () => {
    const {pi, sessions} = await connect();
    const project = pi.defaultProjectRoot;
    for (const id of ["one", "two", "three"]) {
      await sessions.create({id, projectPath: project}, context);
      await sessions.rename({sessionId: id, title: `Login ${id}`}, context);
    }
    await sessions.create({id: "other", projectPath: project}, context);

    const first = await sessions.search({text: "login", projectPaths: [project], limit: 2}, context);
    if (!first.ok) throw new Error(first.error.message);
    expect(first.value.sessions.map((session) => session.id)).toEqual(["three", "two"]);
    expect(first.value.nextCursor).not.toBeNull();
    const rest = await sessions.search({text: "login", projectPaths: [project], limit: 2, cursor: first.value.nextCursor!}, context);
    expect(rest).toMatchObject({ok: true, value: {sessions: [{id: "one"}], nextCursor: null}});
    // A cursor the client made up fails rather than reading from an arbitrary position.
    expect(await sessions.search({text: "login", projectPaths: [project], limit: 2, cursor: "nonsense"}, context)).toMatchObject({ok: false});
  });

  it("reports live status: running while a turn runs, idle and gone from status when it ends", async () => {
    const {get, pi} = await connect();
    const {info} = await pi.createSession();
    const status = await get(SessionStatusService, {});
    const seen = await record(status.statuses);
    cleanups.push(seen.stop);
    pi.faux.setResponses([fauxAssistantMessage("Done.")]);

    await pi.sessionRuntime.sendMessage({contentParts: [{text: "Go", type: "text"}], modelReference: selectedModelReference, sessionId: info.id});
    await pi.settled(info.id);

    await waitUntil(() => expect(seen.values.some((value) => value.sessions[info.id]?.activity === "running")).toBe(true));
    await waitUntil(() => expect(status.statuses.value.sessions[info.id]).toBeUndefined());
  });

  it("refuses browsers the workers' and the server's variants, and workers anything of another session", async () => {
    const {owner, pi, server, sessions} = await connect();
    await sessions.create({id: "mine", projectPath: pi.defaultProjectRoot}, context);
    // A browser binds the owner variant; a forged call to the reporting method fails at the server.
    const status = await owner.get(SessionStatusService, {}, context);
    expect(status.variant).toBe("owner");
    const forged = (status as unknown as {report(report: unknown, ctx: typeof context): Promise<unknown>}).report;
    await expect(Promise.resolve().then(() => forged({kind: "activity", activity: "running"}, context))).rejects.toBeDefined();
    status.release();
    // A browser's chat is the owner variant, never the server's: the workflows' methods are not reachable from it.
    const chat = await owner.get(ChatService, {sessionId: "mine"}, context);
    expect(chat.variant).toBe("owner");
    const stopWork = (chat as unknown as {stopWork(ctx: typeof context): Promise<unknown>}).stopWork;
    await expect(Promise.resolve().then(() => stopWork(context))).rejects.toBeDefined();
    chat.release();

    // A session host acts as its worker principal: it reports for its own session, and gets no tab's view.
    await pi.sessions.get({sessionId: "mine"});
    const host = (await server.serverHost.hosts.startedHost("mine"))!;
    const worker = await host.get(SessionStatusService, {}, context);
    expect(worker.variant).toBe("worker");
    worker.release();
    await expect(host.get(SessionsService, {clientId: "x"}, context, {readyTimeout: 500})).rejects.toMatchObject({code: "forbidden"});
    await expect(host.get(ChatService, {sessionId: "someone-else"}, context, {readyTimeout: 500})).rejects.toBeDefined();
  });

  it("drops a report of a host generation that stopped", async () => {
    const {get, pi, server} = await connect();
    const {info} = await pi.createSession();
    await pi.sessions.get({sessionId: info.id});
    const hosts = server.serverHost.hosts;
    const stale = (await hosts.startedHost(info.id))!;
    const reporter = await stale.get(SessionStatusService, {}, context);
    if (reporter.variant !== "worker") throw new Error("Expected the worker variant.");

    // The host is replaced: its generation is no longer current.
    await pi.sessionRuntime.release({sessionId: info.id, workspacePath: pi.defaultProjectRoot});
    await pi.sessions.get({sessionId: info.id});
    await reporter.report({kind: "activity", activity: "running"}, context).catch(() => undefined);

    const status = await get(SessionStatusService, {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(status.statuses.value.sessions[info.id]?.activity ?? "idle").toBe("idle");
  });

  it("returns declared contract errors by tag, and every other failure as a GenericError", async () => {
    const {get, pi, sessions, owner} = await connect();
    pi.faux.setResponses([fauxAssistantMessage("one")]);
    await sessions.create({id: "errors", message: firstMessage, projectPath: pi.defaultProjectRoot}, context);
    await pi.settled("errors");
    const chat = await get(ChatService, {sessionId: "errors"});

    // A plain error thrown by a checkpoint method is undeclared, so it is a GenericError, never a declared one such as
    // CheckpointConflictError (which would offer to discard changes).
    expect(await chat.redoCheckpoint({}, context)).toEqual({ok: false, error: {code: "GenericError", message: "No checkpoint is available to redo."}});
    expect(await chat.sendMessage({contentParts: [{text: "x", type: "text"}], modelReference: {...selectedModelReference, id: "missing-model"}}, context)).toEqual({
      ok: false,
      error: {code: "GenericError", message: "Selected model is not available."},
    });
    // A declared error keeps its own tag and message.
    expect(await sessions.rename({sessionId: "errors", title: " "}, context)).toEqual({ok: false, error: {code: "RenameSessionError", message: "Session title cannot be empty."}});
    // Holding an unknown session fails.
    await expect(owner.get(ChatService, {sessionId: "unknown"}, context, {readyTimeout: 500})).rejects.toThrow("Session not found.");
    expect(await chat.abort(context)).toEqual({ok: true, value: null});
  });

  it("serves the non-session services: calls return results or tagged errors", async () => {
    const {get, pi} = await connect();
    const folders = await get(FoldersService, {});
    const workspace = await get(WorkspaceService, {});

    const created = await folders.create({path: `${pi.defaultProjectRoot}/made-over-the-wire`}, context);
    expect(created).toEqual({ok: true, value: {path: `${pi.defaultProjectRoot}/made-over-the-wire`}});
    // The default project is a plain folder, not a Git repository.
    expect(await workspace.listBranches({projectPath: pi.defaultProjectRoot}, context)).toMatchObject({ok: false, error: {code: "WorkspaceNotARepositoryError"}});
    // A member of an error union (`WorkspaceFileError`) keeps its own tag.
    expect(await workspace.readFile({path: "../outside", projectPath: pi.defaultProjectRoot}, context)).toMatchObject({ok: false, error: {code: "WorkspaceFileNotFoundError"}});
    // Payloads are validated at the boundary.
    expect(await workspace.readFile({path: 1} as never, context)).toMatchObject({ok: false, error: {code: "GenericError", message: "The request is invalid."}});
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

    it("sends a terminal's output only to clients holding it, and its listing to every client", async () => {
      const {get, pi, server} = await connect();
      const workspace = await get(WorkspaceService, {});
      // A second window: it follows the list of terminals but never shows this one.
      const other = await server.connectClient();
      const otherWorkspace = await get(WorkspaceService, {}, other.host as typeof server.client);

      expect(await workspace.openTerminal({cols: 80, cwd: pi.defaultProjectRoot, id: "wire-terminal", rows: 24, sessionId: "s"}, context)).toMatchObject({
        ok: true,
        value: {id: "wire-terminal", number: 1},
      });
      await waitUntil(() => expect(otherWorkspace.terminals.value.terminals["wire-terminal"]).toMatchObject({sessionId: "s"}));

      const terminal = await get(TerminalService, {terminalId: "wire-terminal"});
      await terminal.write({data: shellCommand("echo WIRE_$((20+1))", "node -p \"'WIRE_' + (20+1)\"")}, context);
      await waitUntil(() => expect(terminal.output.value.output).toContain("WIRE_21"), {timeoutMs: 5_000});
      // The listing carries no output, and the window that never held it received none.
      expect(JSON.stringify(otherWorkspace.terminals.value)).not.toContain("WIRE_21");
      const otherReceived = other.received.map((frame) => new TextDecoder().decode(frame)).join("\n");
      expect(otherReceived).not.toContain("WIRE_21");
    });

    it("replays history to a client that attaches later, applies the last resize, and ends the output on close", async () => {
      const {get, pi, server} = await connect();
      const workspace = await get(WorkspaceService, {});
      await workspace.openTerminal({cols: 80, cwd: pi.defaultProjectRoot, id: "shared", rows: 24, sessionId: "s"}, context);
      const first = await get(TerminalService, {terminalId: "shared"});
      await first.write({data: shellCommand("echo EARLY_$((1+1))", "node -p \"'EARLY_' + (1+1)\"")}, context);
      await waitUntil(() => expect(first.output.value.output).toContain("EARLY_2"), {timeoutMs: 5_000});

      const otherClient = await server.connectClient();
      const other = await get(TerminalService, {terminalId: "shared"}, otherClient.host as typeof server.client);
      await waitUntil(() => expect(other.output.value.output).toContain("EARLY_2"));

      // Whoever resizes last sets the shell's size.
      await first.resize({cols: 100, rows: 30}, context);
      await other.resize({cols: 90, rows: 20}, context);
      await other.write({data: shellCommand("stty size", "node -p \"process.stdout.rows + ' ' + process.stdout.columns\"")}, context);
      await waitUntil(() => expect(first.output.value.output).toContain("20 90"), {timeoutMs: 5_000});

      expect(await workspace.closeTerminal({id: "shared"}, context)).toEqual({ok: true, value: null});
      await waitUntil(() => expect(other.output.value.closed).toBe(true));
      expect(await other.write({data: "x"}, context)).toMatchObject({ok: false, error: {code: "TerminalNotFoundError"}});
    });

    it("fails to hold an unknown terminal", async () => {
      const {owner} = await connect();
      await expect(owner.get(TerminalService, {terminalId: "missing"}, context, {readyTimeout: 500})).rejects.toThrow("Terminal not found.");
    });
  });
});
