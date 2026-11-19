import type {ModelReference} from "@supernova/contracts/services/sessions/schemas";
import type {ChatDocument} from "@supernova/contracts/services/chat/schemas";
import type {UserMessageContentPart} from "@supernova/contracts/services/chat/schemas";
import type {ListedSession, SessionStatusEntry, SessionStatuses, SessionsView} from "@supernova/contracts/services/sessions/services";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {sessionActions} from "@/features/sessions/api/conversation/session-commands";
import {historyOf} from "@/features/sessions/api/chat-history";
import {followSession, markSeenAsItChanges, syncSessions} from "@/features/sessions/api/sessions-sync";
import {readSessionView} from "@/features/sessions/hooks/use-session";
import {listedSessions, sessionView} from "@/features/sessions/lib/session-view";
import {useSessionOptimismStore} from "@/features/sessions/stores/session-optimism-store";
import {hasUnseenActivity, useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import {sessionToastManager} from "@/lib/toast";
import type {ChatOwner, RuntimeClient, SessionsOwner} from "@/runtime/client";
import {page, sessionDocument, text, transcript, turnAt, userEntry, runningLive} from "@tests/support/session";
import {defineFacet, PluginError} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ChatService} from "@supernova/contracts/services/chat/services";
import {SessionsService, SessionStatusService} from "@supernova/contracts/services/sessions/services";
import type {OwnerOf} from "@/runtime/references";
import {asOwner, currentValue} from "@/runtime/references";
import {Published, testRuntimeClient} from "@tests/support/test-server";

const model = {
  id: "claude-sonnet",
  providerId: "anthropic",
  thinkingLevel: "high",
} satisfies ModelReference;

const contentParts = [{text: "Fix this", type: "text"}] satisfies readonly UserMessageContentPart[];
const ok = null;
const NAVIGATION_METHODS = {redo: "redoCheckpoint", revert: "revertToMessage", undo: "undoCheckpoint"} as const;

let client: RuntimeClient | undefined;

// The view the page builds, over `document` as the session's chat document (none for `null`).
function live(sessionId = "session-1", document: ChatDocument | null = session({id: sessionId})) {
  const entry = client && currentValue(client.status.statuses)?.sessions[sessionId];
  const record = client && readSessionView(client, sessionId).record;
  const optimism = useSessionOptimismStore.getState().optimism[sessionId];
  const view = sessionView({entry, optimism, record, session: document ?? undefined});
  return {...view, liveMessage: view.liveTurn?.userMessage?.contentParts, turnIds: view.turns.map((turn) => turn.id)};
}

function session(input?: Partial<ChatDocument>): ChatDocument {
  return {...sessionDocument(), updatedAt: "2026-01-01T00:00:00.000Z", ...input};
}

function twoTurns(): ChatDocument {
  return session({entries: page([turnAt(1), turnAt(3)])});
}

function undoneLast(document: ChatDocument): ChatDocument {
  return {...document, entries: page(document.entries.items.slice(0, 1)), undone: page(document.entries.items.slice(1), document.entries.items[0]!.id)};
}

function entry(input?: Partial<SessionStatusEntry>): SessionStatusEntry {
  return {activity: "idle", notices: [], setupStep: null, ...input};
}

function listed(id: string, title: string, updatedAt: string, pinned = false, projectPath = "/workspace"): ListedSession {
  return {forked: false, id, pinned, projectPath, title, updatedAt};
}

function failure(code: string, message: string): never {
  throw new PluginError(code, message);
}

async function waitUntil(assertion: () => void | Promise<void>): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < 2_000) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Timed out waiting for condition.");
}

interface FakeServices {
  readonly client: RuntimeClient;
  readonly close: () => Promise<void>;
  readonly statuses: Published<SessionStatuses>;
  readonly documents: Map<string, Published<ChatDocument>>;
  readonly records: Map<string, ListedSession>;
  readonly view: Published<SessionsView>;
  readonly chat: {-readonly [K in keyof Omit<ChatOwner, "document">]: ChatOwner[K]};
  readonly sessions: {-readonly [K in keyof Omit<SessionsOwner, "view">]: SessionsOwner[K]};
  readonly held: string[];
}

type Method = (...args: never[]) => unknown;

// Each call looks the method up again, so a test can replace one after the client holds the chat.
function current<T extends object>(target: T): T {
  return Object.fromEntries(Object.keys(target).map((name) => [name, (...args: never[]) => (target[name as keyof T] as Method)(...args)])) as T;
}

function fakeServices(): FakeServices {
  const statuses = new Published<SessionStatuses>({sessions: {}});
  const documents = new Map<string, Published<ChatDocument>>();
  const held: string[] = [];
  const documentOf = (sessionId: string) => {
    let document = documents.get(sessionId);
    if (!document) {
      document = new Published(session({id: sessionId}));
      documents.set(sessionId, document);
    }
    return document;
  };
  const records = new Map<string, ListedSession>();
  const view = new Published<SessionsView>({projects: {}, open: null});
  const recordOf = (sessionId: string) => records.get(sessionId) ?? listed(sessionId, "Session", "2026-01-01T00:00:00.000Z");
  const chat = {
    abort: vi.fn(async () => ok),
    compact: vi.fn(async () => ok),
    loadHistory: vi.fn(async () => page([], null, 0)),
    redoCheckpoint: vi.fn(async () => ok),
    revertToMessage: vi.fn(async () => ok),
    sendMessage: vi.fn(async () => ok),
    undoCheckpoint: vi.fn(async () => ok),
  } as FakeServices["chat"];
  const unused = async () => ok;
  const sessions = {
    showProject: unused,
    hideProject: unused,
    loadMore: unused,
    archive: unused,
    search: unused,
    create: vi.fn(async () => null),
    fork: vi.fn(async () => listed("fork", "Session", "2026-01-01T00:00:00.000Z")),
    listComposerSuggestions: vi.fn(async () => ({items: []})),
    listModels: vi.fn(async () => []),
    rename: vi.fn(async () => ok),
    openSession: vi.fn(async ({sessionId}: {readonly sessionId: string}) => (view.change((draft) => void (draft.open = recordOf(sessionId))), ok)),
    closeSession: vi.fn(async () => (view.change((draft) => void (draft.open = null)), ok)),
    pin: vi.fn(async () => ok),
  } as unknown as FakeServices["sessions"];
  const {client, close} = testRuntimeClient({
    server: defineFacet<RuntimePrincipal>((host) => {
      host.serve(SessionsService, (_params, _principal, self) => ({variant: "owner", members: {view: view.member(self), ...current(sessions)}}));
      host.serve(SessionStatusService, (_params, _principal, self) => ({variant: "owner", members: {statuses: statuses.member(self)}}));
    }),
    session: (sessionId) =>
      defineFacet<RuntimePrincipal>((host) => {
        held.push(sessionId);
        host.serve(ChatService, (_params, _principal, self) => ({variant: "owner", members: {document: documentOf(sessionId).member(self), ...current(chat)}}));
      }),
  });
  return {client, close, statuses, documents, records, view, held, chat, sessions};
}

// Waits until the page's history holds what the server published: memory links deliver on later tasks.
async function publish(services: FakeServices, sessionId: string, value: ChatDocument): Promise<void> {
  services.documents.get(sessionId)!.set(value);
  await waitUntil(() => expect(historyOf(services.client, sessionId).read().document).toEqual(value));
}

async function setStatuses(services: FakeServices, sessions: Record<string, SessionStatusEntry>): Promise<void> {
  services.statuses.set({sessions});
  await waitUntil(() => expect(services.client.status.statuses.value).toEqual({sessions}));
}

describe("session commands and views", () => {
  let disconnect = (): void => undefined;

  beforeEach(() => {
    disconnect();
    useSessionOptimismStore.setState({optimism: {}});
    useSessionVisitsStore.setState({visits: {}});
  });

  afterEach(() => {
    disconnect();
    disconnect = () => undefined;
    client = undefined;
    useSessionOptimismStore.setState({optimism: {}});
    useSessionVisitsStore.setState({visits: {}});
  });

  function setup() {
    const services = fakeServices();
    client = services.client;
    const chats = new Map<string, OwnerOf<typeof ChatService>>();
    const chatOf = (sessionId: string) => {
      let chat = chats.get(sessionId);
      if (!chat) {
        chat = asOwner(services.client.host.hold(ChatService, {sessionId}, BACKGROUND_CONTEXT));
        chats.set(sessionId, chat);
      }
      return chat;
    };
    const stops = [syncSessions(services.client, () => undefined)];
    disconnect = () => {
      stops.forEach((stop) => stop());
      void services.close();
    };
    const open = (sessionId: string) => void stops.push(followSession(services.client, sessionId, chatOf(sessionId)));
    const document = (sessionId: string) => historyOf(services.client, sessionId).read().document;
    return {actions: sessionActions(services.client, chatOf), chatOf, document, open, services};
  }

  it("keeps every value of a followed session's conversation, and reads its record from the tab's view", async () => {
    const {document, open, services} = setup();
    services.documents.set("session-1", new Published(session()));
    const record = () => readSessionView(services.client, "session-1").record;

    // A record a project's list shows is there before the session is opened.
    services.view.change((draft) => void (draft.projects["/workspace"] = {depth: 5, loading: false, hasMore: false, items: [listed("session-1", "Listed", "t1")]}));
    await waitUntil(() => expect(record()?.title).toBe("Listed"));

    open("session-1");
    await waitUntil(() => expect(services.held).toEqual(["session-1"]));
    await waitUntil(() => expect(document("session-1")).toEqual(session()));

    // A rename reaches the page through the tab's view, the conversation untouched.
    await waitUntil(() => expect(record()?.title).toBe("Session"));
    services.view.change((draft) => void (draft.open = listed("session-1", "Renamed", "2026-01-01T00:00:00.000Z")));
    await waitUntil(() => expect(record()?.title).toBe("Renamed"));
    expect(document("session-1")).toEqual(session());
  });

  it("drops the loaded history of the oldest sessions past four that nothing uses", async () => {
    const {chatOf, document, services} = setup();
    const ids = ["a", "b", "c", "d", "e", "f"];
    const follows = ids.map((id) => followSession(services.client, id, chatOf(id)));
    await waitUntil(() => expect(ids.every((id) => document(id))).toBe(true));

    // Still followed: kept however many there are.
    follows.slice(0, 5).forEach((stop) => stop());
    expect(document("a")).toBeUndefined();
    expect(["b", "c", "d", "e", "f"].every((id) => document(id))).toBe(true);

    // Followed again, a session leaves the unfollowed ones and loses nothing when the next one goes.
    const again = followSession(services.client, "b", chatOf("b"));
    follows[5]!();
    expect(["b", "c", "d", "e", "f"].every((id) => document(id))).toBe(true);
    again();
    expect(document("c")).toBeUndefined();
    expect(["b", "d", "e", "f"].every((id) => document(id))).toBe(true);
  });

  it("opens one session at a time: the next page's open replaces it, and the old page leaving does not clear it", async () => {
    const {chatOf, services} = setup();
    const first = followSession(services.client, "session-1", chatOf("session-1"));
    await waitUntil(() => expect(services.view.current.open?.id).toBe("session-1"));

    // The next page mounts before the first one unmounts, as a route change does.
    const second = followSession(services.client, "session-2", chatOf("session-2"));
    await waitUntil(() => expect(services.view.current.open?.id).toBe("session-2"));
    first();
    expect(services.sessions.closeSession).not.toHaveBeenCalled();
    expect(services.view.current.open?.id).toBe("session-2");

    second();
    await waitUntil(() => expect(services.view.current.open).toBeNull());
  });

  it("shows what the runtime's status reports, with no optimism, until the document says otherwise", async () => {
    const {services} = setup();

    await setStatuses(services, {"session-1": entry({activity: "running"}), "session-2": entry({setupStep: "worktree"})});
    expect(live("session-1", null)).toMatchObject({status: "streaming"});
    expect(live("session-2")).toMatchObject({setupStep: "worktree", status: "idle"});

    await setStatuses(services, {"session-1": entry({activity: "compacting"}), "session-2": entry()});
    expect(live("session-1", null)).toMatchObject({status: "compacting"});
    expect(live("session-2")).toMatchObject({setupStep: null, status: "idle"});
    expect(useSessionOptimismStore.getState().optimism).toEqual({});

    // Status replicates apart from the document; a known document is the source so status and content never
    // disagree within one update.
    expect(live()).toMatchObject({status: "idle"});
    expect(live("session-2", session({id: "session-2", live: runningLive()}))).toMatchObject({status: "streaming"});
  });

  it("lists the live listing with renames and pins not yet applied, in listing order", () => {
    const items = [listed("session-1", "New", "t3"), listed("session-3", "Untouched", "t0"), listed("session-4", "Unpinning", "t0", true)];
    const optimism = {"session-3": {pinned: true, title: "Renaming"}, "session-4": {pinned: false}};

    expect(listedSessions({items, optimism, projectPath: "/workspace"}).map((session) => [session.id, session.title, session.pinned])).toEqual([
      ["session-3", "Renaming", true],
      ["session-1", "New", false],
      ["session-4", "Unpinning", false],
    ]);
  });

  it("shows a session this client is starting until the listing has it, in its project only", () => {
    const message = {id: "m", contentParts, timestamp: "t2"};
    const optimism = {
      "session-2": {created: listed("session-2", "Just created", "t2"), message},
      elsewhere: {created: listed("elsewhere", "Elsewhere", "t9", false, "/other"), message},
    };
    const items = [listed("session-1", "One", "t1")];

    expect(listedSessions({items, optimism, projectPath: "/workspace"}).map((session) => session.id)).toEqual(["session-2", "session-1"]);
    expect(listedSessions({items: [listed("session-2", "Just created", "t2"), ...items], optimism, projectPath: "/workspace"}).map((session) => session.id)).toEqual([
      "session-2",
      "session-1",
    ]);
  });

  it("leaves a session being archived out", () => {
    const items = [listed("session-1", "One", "t1"), listed("session-3", "Three", "t0")];

    expect(listedSessions({items, optimism: {"session-1": {archived: true}}, projectPath: "/workspace"}).map((session) => session.id)).toEqual(["session-3"]);
  });

  it("shows a sent message until the send resolves", async () => {
    const {actions, services} = setup();
    let accept!: () => void;
    services.chat.sendMessage = vi.fn(() => new Promise<typeof ok>((resolve) => (accept = () => resolve(ok))));

    actions.sendMessage({contentParts, modelReference: model, sessionId: "session-1"});

    expect(live()).toMatchObject({liveMessage: contentParts, status: "streaming"});
    await waitUntil(() => expect(services.chat.sendMessage).toHaveBeenCalledWith({captureCheckpoints: true, contentParts, modelReference: model}, expect.anything()));
    accept();
    await waitUntil(() => expect(live()).toMatchObject({liveMessage: undefined, status: "idle"}));
  });

  it("shows a new authored turn after undo without splitting extension continuations", async () => {
    const {actions, document, open, services} = setup();
    const initial = session({entries: page([turnAt(1)]), undone: page([turnAt(3), turnAt(5)], 1)});
    services.documents.set("session-1", new Published(initial));
    open("session-1");
    await waitUntil(() => expect(document("session-1")).toEqual(initial));
    let accept!: () => void;
    services.chat.sendMessage = vi.fn(() => new Promise<typeof ok>((resolve) => (accept = () => resolve(ok))));

    actions.sendMessage({contentParts, modelReference: model, sessionId: "session-1"});
    expect(live("session-1", document("session-1"))).toMatchObject({liveMessage: contentParts, turnIds: ["1"], undoneTurns: []});
    expect(document("session-1")?.undone).toEqual(initial.undone);
    await waitUntil(() => expect(services.chat.sendMessage).toHaveBeenCalledOnce());
    const served = services.documents.get("session-1")!;
    // An extension's continuation: a user entry with nothing authored, so it belongs to the turn before it.
    const continuation = transcript([userEntry({parts: [text("Continuation")], authored: false})], {firstId: 6});
    await publish(services, "session-1", {...initial, entries: page([...initial.entries.items, ...continuation])});
    expect(live("session-1", document("session-1"))).toMatchObject({liveMessage: contentParts, turnIds: ["1"]});
    expect(useSessionOptimismStore.getState().optimism["session-1"]?.message).toBeDefined();

    await publish(
      services,
      "session-1",
      session({entries: page([...served.current.entries.items, transcript([userEntry({parts: contentParts})], {firstId: 7})[0]!]), runStart: 7})
    );
    expect(live("session-1", document("session-1"))).toMatchObject({liveMessage: contentParts, liveTurn: {id: "7"}, turnIds: ["1"], undoneTurns: []});
    accept();
    await waitUntil(() => expect(useSessionOptimismStore.getState().optimism["session-1"]?.message).toBeUndefined());
    expect(live("session-1", document("session-1")).undoneTurns).toEqual([]);
  });

  it("restores undone turns, drops the sent message, and reports the error when the send fails", async () => {
    const {actions, document, open, services} = setup();
    const initial = undoneLast(twoTurns());
    services.documents.set("session-1", new Published(initial));
    open("session-1");
    await waitUntil(() => expect(document("session-1")).toEqual(initial));
    const undoneTurns = live("session-1", document("session-1")).undoneTurns;
    services.chat.sendMessage = vi.fn(async () => failure("internal", "Model unavailable"));

    actions.sendMessage({contentParts, modelReference: model, sessionId: "session-1"});
    expect(live("session-1", document("session-1"))).toMatchObject({liveMessage: contentParts, undoneTurns: []});

    await waitUntil(() => expect(live("session-1", document("session-1"))).toMatchObject({error: "Model unavailable", liveMessage: undefined, status: "idle", undoneTurns}));
  });

  it("shows the runtime's notices as toasts in their session's queue: one for all extension notices, one per other notice", async () => {
    const {services} = setup();
    const add = vi.spyOn(sessionToastManager("session-1"), "add").mockReturnValue("toast-1");
    const notice = (id: string, message: string, extensionPath?: string) => ({id, at: "t1", level: "warning" as const, message, ...(extensionPath ? {extensionPath} : {})});
    const failure = {id: "n3", at: "t2", level: "error" as const, message: "The message was not answered (no_model)."};

    await setStatuses(services, {"session-1": entry({notices: [notice("n1", 'subscribes to "message_update", which Supernova does not deliver.', "/ext/fixture.ts")]})});
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]?.[0]).toMatchObject({title: "Some extensions are limited", timeout: 0, type: "warning"});

    // More extension notices, and a repeated directory value, add no toast; its Details opens the dialog listing them.
    const both = [
      notice("n1", 'subscribes to "message_update", which Supernova does not deliver.', "/ext/fixture.ts"),
      notice("n2", "registers commands (fixture), which Supernova does not support.", "/ext/other.ts"),
    ];
    await setStatuses(services, {"session-1": entry({notices: both})});
    await setStatuses(services, {"session-1": entry({notices: both})});
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]?.[0].actionProps).toMatchObject({children: "Details"});

    // A failure of the session's own work is its own, fading toast.
    await setStatuses(services, {"session-1": entry({notices: [...both, failure]})});
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[1]?.[0]).toMatchObject({title: "Something went wrong", description: failure.message, type: "error"});
    expect(add.mock.calls[1]?.[0]).not.toHaveProperty("timeout");
  });

  it.each([
    {action: "undo", code: "CheckpointConflictError" as const, decision: "confirm", outcome: "conflict"},
    {action: "redo", code: "CheckpointUncapturedError" as const, decision: "cancel", outcome: "uncaptured"},
    {action: "revert", code: "CheckpointConflictError" as const, decision: "failed retry", outcome: "conflict"},
  ] as const)("holds $action optimistically on $outcome until $decision", async ({outcome, code, decision, action}) => {
    const {actions, services} = setup();
    const forceFlags: boolean[] = [];
    services.chat[NAVIGATION_METHODS[action]] = vi.fn(async (payload: {readonly force?: boolean}) => {
      forceFlags.push(payload.force ?? false);
      if (!payload.force) return failure(code, "Refused.");
      return decision === "failed retry" ? failure("internal", "Restore failed") : ok;
    });
    const document = twoTurns();
    // Undo and revert move the timeline back before turn 3; redo moves the undone turn 3 forward again.
    const shown = action === "redo" ? undoneLast(document) : document;
    // Undo and revert of turn 3 end with turn 1 last; redo ends with turn 3 last.
    const navigation =
      action === "revert"
        ? ({action, lastTurnId: "1", sessionId: "session-1", turnId: "3"} as const)
        : ({action, lastTurnId: action === "redo" ? "3" : "1", sessionId: "session-1"} as const);

    expect(await actions.navigateCheckpoint(navigation)).toEqual({reason: outcome, status: "refused"});
    expect(live("session-1", shown)).toMatchObject({status: "checkpoint-navigating", turnIds: action === "redo" ? ["1", "3"] : ["1"]});
    // Nothing else starts while a refused restore waits for the user.
    expect(await actions.navigateCheckpoint({action: "undo", lastTurnId: "1", sessionId: "session-1"})).toMatchObject({status: "failed"});

    if (decision === "cancel") {
      actions.cancelNavigation("session-1");
      expect(forceFlags).toEqual([false]);
    } else {
      expect(await actions.navigateCheckpoint({...navigation, force: true})).toMatchObject({status: decision === "confirm" ? "applied" : "failed"});
      expect(forceFlags).toEqual([false, true]);
    }
    expect(live("session-1", shown)).toMatchObject({status: "idle", turnIds: action === "redo" ? ["1"] : ["1", "3"]});
  });

  it.each([
    {action: "undo", before: twoTurns(), after: undoneLast(twoTurns()), navigation: {action: "undo", lastTurnId: "1"}, shown: ["1"]},
    {action: "redo", before: undoneLast(twoTurns()), after: twoTurns(), navigation: {action: "redo", lastTurnId: "3"}, shown: ["1", "3"]},
    {action: "revert", before: twoTurns(), after: undoneLast(twoTurns()), navigation: {action: "revert", lastTurnId: "1", turnId: "3"}, shown: ["1"]},
  ] as const)("keeps $action shown when the runtime's document applies it before the command's reply", async ({after, before, navigation, shown}) => {
    const {actions, document, open, services} = setup();
    services.documents.set("session-1", new Published(before));
    open("session-1");
    await waitUntil(() => expect(document("session-1")).toEqual(before));
    let reply!: () => void;
    services.chat[NAVIGATION_METHODS[navigation.action]] = vi.fn(() => new Promise<typeof ok>((resolve) => (reply = () => resolve(ok))));

    const outcome = actions.navigateCheckpoint({...navigation, sessionId: "session-1"});
    expect(live("session-1", document("session-1"))).toMatchObject({turnIds: shown});

    // The runtime publishes the navigated document first; the reply follows.
    await waitUntil(() => expect(services.chat[NAVIGATION_METHODS[navigation.action]]).toHaveBeenCalledOnce());
    await publish(services, "session-1", after);
    expect(live("session-1", document("session-1"))).toMatchObject({turnIds: shown});
    reply();
    await expect(outcome).resolves.toEqual({status: "applied"});
    expect(live("session-1", document("session-1"))).toMatchObject({status: "idle", turnIds: shown});
  });

  it.each([
    {name: "the document showing it", after: undoneLast(twoTurns()), shown: ["1"]},
    {name: "a document showing elsewhere", after: session({entries: page([turnAt(1), turnAt(3), turnAt(5)])}), shown: ["1", "3", "5"]},
  ])("keeps an undo shown after its reply until $name arrives", async ({after, shown}) => {
    const {actions, document, open, services} = setup();
    services.documents.set("session-1", new Published(twoTurns()));
    open("session-1");
    await waitUntil(() => expect(document("session-1")).toEqual(twoTurns()));

    await expect(actions.navigateCheckpoint({action: "undo", lastTurnId: "1", sessionId: "session-1"})).resolves.toEqual({status: "applied"});
    expect(live("session-1", document("session-1"))).toMatchObject({status: "checkpoint-navigating", turnIds: ["1"]});

    // A document that changes no turns, such as a new context usage, does not end the wait.
    await publish(services, "session-1", {...twoTurns(), context: {usedTokens: 10, contextWindow: 200_000}});
    expect(live("session-1", document("session-1"))).toMatchObject({status: "checkpoint-navigating", turnIds: ["1"]});

    await publish(services, "session-1", after);
    expect(live("session-1", document("session-1"))).toMatchObject({status: "idle", turnIds: shown});
  });

  it("reports a navigation the server rejects outright by its code", async () => {
    const {actions, services} = setup();
    services.chat.undoCheckpoint = vi.fn(async () => failure("CheckpointInheritedError", "Inherited."));

    const outcome = await actions.navigateCheckpoint({action: "undo", lastTurnId: null, sessionId: "session-1"});

    expect(outcome).toEqual({code: "CheckpointInheritedError", message: "Inherited.", status: "failed"});
    expect(live("session-1", twoTurns())).toMatchObject({status: "idle", turnIds: ["1", "3"]});
  });

  it("shows a new session at once and creates it with its first message", async () => {
    const {actions, document, open, services} = setup();
    let resolveCreate!: () => void;
    services.sessions.create = vi.fn(
      () =>
        new Promise<null>((resolve) => {
          resolveCreate = () => resolve(null);
        })
    );

    const pending = actions.startSession({
      contentParts,
      modelReference: model,
      projectPath: "/workspace",
      sessionId: "new-session",
      workspace: {baseRef: "main", mode: "worktree"},
    });

    expect(document("new-session")).toMatchObject({id: "new-session", entries: {items: []}});
    // Its record shows it in its project's sidebar before the server answers.
    expect(useSessionOptimismStore.getState().optimism["new-session"]?.created).toMatchObject({id: "new-session", projectPath: "/workspace", title: "Untitled session"});
    expect(live("new-session")).toMatchObject({liveMessage: contentParts, setupStep: "worktree", status: "streaming"});
    open("new-session");
    await waitUntil(() => expect(services.sessions.create).toHaveBeenCalledOnce());
    resolveCreate();
    await expect(pending).resolves.toEqual({status: "started"});
    // The pending message stays until the chat delivers the turn, so the turn never disappears in between.
    expect(live("new-session")).toMatchObject({liveMessage: contentParts, setupStep: null});
    await publish(services, "new-session", session({id: "new-session", entries: page(transcript([userEntry({parts: contentParts})]))}));
    await waitUntil(() => expect(live("new-session")).toMatchObject({liveMessage: undefined, setupStep: null}));
  });

  it("removes every trace of a new session the server could not create", async () => {
    const {actions, document, services} = setup();
    services.sessions.create = vi.fn(async () => failure("CreateSessionError", "Worktree could not be created."));

    const outcome = await actions.startSession({contentParts, modelReference: model, projectPath: "/workspace", sessionId: "new-session", workspace: {mode: "local"}});

    expect(outcome).toEqual({message: "Worktree could not be created.", status: "failed"});
    expect(document("new-session")).toBeUndefined();
    expect(useSessionOptimismStore.getState().optimism["new-session"]).toBeUndefined();
  });

  it("guards session commands while the server reports work", async () => {
    const {actions, services} = setup();
    await setStatuses(services, {"session-1": entry({activity: "running"})});

    actions.sendMessage({contentParts, modelReference: model, sessionId: "session-1"});
    actions.compactSession({modelReference: model, sessionId: "session-1"});

    expect(services.chat.sendMessage).not.toHaveBeenCalled();
    expect(services.chat.compact).not.toHaveBeenCalled();
  });

  it("shows a stop until the server reports the session idle", async () => {
    const {actions, services} = setup();
    await setStatuses(services, {"session-1": entry({activity: "running"})});

    actions.abortSession("session-1");

    expect(live()).toMatchObject({status: "stopping"});
    await waitUntil(() => expect(services.chat.abort).toHaveBeenCalledOnce());
    // The abort answered, but the status still says running: a later status the client has seen proves the stop stays.
    await setStatuses(services, {"session-1": entry({activity: "running"}), other: entry({activity: "running"})});
    expect(live()).toMatchObject({status: "stopping"});
    await setStatuses(services, {"session-1": entry({activity: "idle"})});
    await waitUntil(() => expect(live()).toMatchObject({status: "idle"}));
  });

  it("shows a compaction from the request until the server's compaction ends", async () => {
    const {actions, services} = setup();
    let finish!: () => void;
    services.chat.compact = vi.fn(() => new Promise<typeof ok>((resolve) => (finish = () => resolve(ok))));

    actions.compactSession({modelReference: model, sessionId: "session-1"});

    expect(live()).toMatchObject({status: "compacting"});
    await waitUntil(() => expect(services.chat.compact).toHaveBeenCalledOnce());
    finish();
    await waitUntil(() => expect(live()).toMatchObject({status: "idle"}));
  });

  it("stamps a followed session as visited at its activity time, so later activity elsewhere stays unseen", async () => {
    const {document, open, services} = setup();
    services.documents.set("session-1", new Published(session()));
    open("session-1");
    const stopMarking = markSeenAsItChanges(services.client, "session-1");
    await waitUntil(() => expect(document("session-1")).toBeDefined());

    await publish(services, "session-1", {...services.documents.get("session-1")!.current, updatedAt: "2026-01-01T00:05:00.000Z"});

    await waitUntil(() => expect(useSessionVisitsStore.getState().visits["session-1"]).toBe("2026-01-01T00:05:00.000Z"));
    expect(hasUnseenActivity({activityAtMs: Date.parse("2026-01-01T00:09:00.000Z"), visitedAt: useSessionVisitsStore.getState().visits["session-1"]})).toBe(true);
    stopMarking();
  });

  it("moves a pin at once and keeps it until the runtime confirms", () => {
    const listing = {items: [listed("newer", "newer", "t2"), listed("older", "older", "t1")]};
    const order = () => listedSessions({items: listing.items, optimism: useSessionOptimismStore.getState().optimism, projectPath: "/workspace"}).map((session) => session.id);
    const {patchOptimism} = useSessionOptimismStore.getState();

    patchOptimism("older", {pinned: true});
    expect(order()).toEqual(["older", "newer"]);
    // The listing reports the pin, then the mutation settles: the order never flips back.
    listing.items = [listed("older", "older", "t1", true), listed("newer", "newer", "t2")];
    expect(order()).toEqual(["older", "newer"]);
    patchOptimism("older", {pinned: undefined});
    expect(order()).toEqual(["older", "newer"]);
  });
});
