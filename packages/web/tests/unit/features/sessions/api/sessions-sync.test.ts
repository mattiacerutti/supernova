import type {ModelReference, Session, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import type {ListedSession, SessionStatusEntry, SessionStatuses, SessionsView} from "@supernova/contracts/services/sessions/services";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {sessionActions} from "@/features/sessions/api/conversation/session-commands";
import {followSession, markSeenAsItChanges, syncSessions} from "@/features/sessions/api/sessions-sync";
import {listedSessions, sessionView} from "@/features/sessions/lib/session-view";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {hasUnseenActivity, useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import {sessionToastManager} from "@/lib/toast";
import type {ChatOwner, RuntimeClient, SessionsOwner} from "@/runtime/transport/runtime-client";
import {assistantEntry, page, runningLive, sessionDocument, text, transcript, turnAt, userEntry} from "@tests/support/session";
import type {FakeState} from "@tests/support/fake-state";
import {fakeState} from "@tests/support/fake-state";

const model = {
  id: "claude-sonnet",
  providerId: "anthropic",
  thinkingLevel: "high",
} satisfies ModelReference;

const contentParts = [{text: "Fix this", type: "text"}] satisfies readonly UserMessageContentPart[];
const ok = {ok: true, value: null} as const;
/** The session runtime method behind each checkpoint navigation command. */
const NAVIGATION_METHODS = {redo: "redoCheckpoint", revert: "revertToMessage", undo: "undoCheckpoint"} as const;

/**
 * How the page shows a session: its document (`document`, an empty session by default; `null` before it loaded),
 * with the store's status and optimism.
 */
function live(sessionId = "session-1", document: Session | null = session({id: sessionId})) {
  const {optimism, records, statuses} = useSessionsStore.getState();
  const view = sessionView({entry: statuses[sessionId], optimism: optimism[sessionId], record: records[sessionId], session: document ?? undefined});
  return {...view, liveMessage: view.liveTurn?.userMessage?.contentParts, turnIds: view.turns.map((turn) => turn.id)};
}

function session(input?: Partial<Session>): Session {
  return {...sessionDocument(), updatedAt: "2026-01-01T00:00:00.000Z", ...input};
}

/** A session with two turns, starting at entries 1 and 3. */
function twoTurns(): Session {
  return session({entries: page([turnAt(1), turnAt(3)])});
}

/** The same session with its last turn undone. */
function undoneLast(document: Session): Session {
  return {...document, entries: page(document.entries.items.slice(0, 1)), undone: page(document.entries.items.slice(1), document.entries.items[0]!.id)};
}

function entry(input?: Partial<SessionStatusEntry>): SessionStatusEntry {
  return {activity: "idle", notices: [], setupStep: null, ...input};
}

function listed(id: string, title: string, updatedAt: string, pinned = false, projectPath = "/workspace"): ListedSession {
  return {forked: false, id, pinned, projectPath, title, updatedAt};
}

/** A failed result with any code; each fake returns one its method declares. */
function failure<Code extends string>(code: Code, message: string): {readonly ok: false; readonly error: {readonly code: Code; readonly message: string}} {
  return {ok: false, error: {code, message}};
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

/** Server-side state the fake services publish, and the calls the client made to them. */
interface FakeServices {
  readonly client: RuntimeClient;
  readonly statuses: FakeState<SessionStatuses>;
  /** Each session's document. */
  readonly documents: Map<string, FakeState<Session>>;
  readonly records: Map<string, ListedSession>;
  readonly view: FakeState<SessionsView>;
  readonly chat: {-readonly [K in keyof Omit<ChatOwner, "session">]: ChatOwner[K]};
  readonly sessions: {-readonly [K in keyof Omit<SessionsOwner, "view">]: SessionsOwner[K]};
  /** The sessions the client held, in order. */
  readonly held: string[];
}

/** A runtime client backed by local state, as Chord's handles expose the server's: each session is held by id. */
function fakeServices(): FakeServices {
  const statuses = fakeState<SessionStatuses>({sessions: {}});
  const documents = new Map<string, FakeState<Session>>();
  const held: string[] = [];
  const documentOf = (sessionId: string) => {
    let document = documents.get(sessionId);
    if (!document) {
      document = fakeState(session({id: sessionId}));
      documents.set(sessionId, document);
    }
    return document;
  };
  const records = new Map<string, ListedSession>();
  const view = fakeState<SessionsView>({projects: {}, open: null});
  const recordOf = (sessionId: string) => records.get(sessionId) ?? listed(sessionId, "Session", "2026-01-01T00:00:00.000Z");
  const chat = {
    abort: vi.fn(async () => ok),
    compact: vi.fn(async () => ok),
    loadHistory: vi.fn(async () => ({ok: true, value: page([], null, 0)}) as const),
    redoCheckpoint: vi.fn(async () => ok),
    revertToMessage: vi.fn(async () => ok),
    sendMessage: vi.fn(async () => ok),
    undoCheckpoint: vi.fn(async () => ok),
  } as FakeServices["chat"];
  const sessions = {
    create: vi.fn(async (payload) => ({ok: true, value: session({id: payload.id})}) as const),
    fork: vi.fn(async () => ({ok: true, value: listed("fork", "Session", "2026-01-01T00:00:00.000Z")}) as const),
    listComposerSuggestions: vi.fn(async () => ({ok: true as const, value: {items: []}})),
    listModels: vi.fn(async () => ({ok: true as const, value: []})),
    rename: vi.fn(async () => ok),
    openSession: vi.fn(async ({sessionId}: {readonly sessionId: string}) => (await view.change((draft) => void (draft.open = recordOf(sessionId))), ok)),
    closeSession: vi.fn(async () => (await view.change((draft) => void (draft.open = null)), ok)),
    pin: vi.fn(async () => ok),
  } as unknown as FakeServices["sessions"];
  // Only what the sessions feature uses; the other services are never reached.
  const client = {
    sessions: new Proxy(sessions, {get: (target, member) => (member === "view" ? view : target[member as keyof typeof target])}),
    status: {statuses},
    holdChat: (sessionId: string) => {
      held.push(sessionId);
      // Methods are looked up per call, so tests can replace one after creating the client.
      const service = new Proxy(chat, {
        get: (target, member) => (member === "session" ? documentOf(sessionId) : target[member as keyof typeof target]),
      });
      return {service, ready: Promise.resolve(), onGone: () => () => undefined, release: () => undefined};
    },
    ready: async () => undefined,
    onConnectionChange: () => () => undefined,
    dispose: async () => undefined,
  } as unknown as RuntimeClient;
  return {client, statuses, documents, records, view, held, chat, sessions};
}

function setStatuses(services: FakeServices, sessions: Record<string, SessionStatusEntry>): Promise<void> {
  return services.statuses.replace({sessions});
}

describe("session commands and views", () => {
  let disconnect = (): void => undefined;

  beforeEach(() => {
    disconnect();
    useSessionsStore.setState({documents: {}, statuses: {}, loadErrors: {}, optimism: {}});
    useSessionVisitsStore.setState({visits: {}});
  });

  afterEach(() => {
    disconnect();
    disconnect = () => undefined;
    useSessionsStore.setState({documents: {}, statuses: {}, loadErrors: {}, optimism: {}});
    useSessionVisitsStore.setState({visits: {}});
  });

  /**
   * The commands over a fake runtime whose directory the store already follows, as the app's does; `open` follows a
   * session's document as its page does.
   */
  function setup() {
    const services = fakeServices();
    const stops = [syncSessions(services.client)];
    disconnect = () => stops.forEach((stop) => stop());
    const open = (sessionId: string) => void stops.push(followSession(services.client, sessionId));
    const document = (sessionId: string) => useSessionsStore.getState().documents[sessionId];
    return {actions: sessionActions(services.client), document, open, services};
  }

  it("keeps every value of a followed session's conversation and record in the store", async () => {
    const {document, open, services} = setup();
    services.documents.set("session-1", fakeState(session()));

    open("session-1");
    await waitUntil(() => expect(services.held).toEqual(["session-1"]));
    await waitUntil(() => expect(document("session-1")).toEqual(session()));

    // A rename reaches the page through the tab's view, the conversation untouched.
    await waitUntil(() => expect(useSessionsStore.getState().records["session-1"]?.title).toBe("Session"));
    await services.view.change((draft) => void (draft.open = listed("session-1", "Renamed", "2026-01-01T00:00:00.000Z")));
    await waitUntil(() => expect(useSessionsStore.getState().records["session-1"]?.title).toBe("Renamed"));
    expect(document("session-1")).toEqual(session());
  });

  it("opens one session at a time: the next page's open replaces it, and the old page leaving does not clear it", async () => {
    const services = fakeServices();
    const first = followSession(services.client, "session-1");
    await waitUntil(() => expect(services.view.value.open?.id).toBe("session-1"));

    // The next page mounts before the first one unmounts, as a route change does.
    const second = followSession(services.client, "session-2");
    await waitUntil(() => expect(services.view.value.open?.id).toBe("session-2"));
    first();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(services.sessions.closeSession).not.toHaveBeenCalled();
    expect(services.view.value.open?.id).toBe("session-2");

    second();
    await waitUntil(() => expect(services.view.value.open).toBeNull());
  });

  it("keeps the branch it has seen as the document's window moves, and drops it when history restarts", () => {
    const {setDocument, addHistoryPage} = useSessionsStore.getState();
    const document = () => useSessionsStore.getState().documents["session-1"]!;
    const shown = () => document().entries.items.map((item) => item.id);
    const undone = () => document().undone.items.map((item) => item.id);
    setDocument(session({entries: page([turnAt(5), turnAt(7)], 3, 2)}));

    // A page that no longer ends at the first entry is dropped.
    addHistoryPage("session-1", "entries", 3, page([turnAt(1)]));
    expect(shown()).toEqual([5, 7]);
    addHistoryPage("session-1", "entries", 5, page([turnAt(1), turnAt(3)]));
    expect(shown()).toEqual([1, 3, 5, 7]);
    expect(document().entries.precedingEntryId).toBeNull();

    // A new turn slides the window past turn 5; what came before stays.
    setDocument(session({entries: page([turnAt(7), turnAt(9)], 5, 3)}));
    expect(shown()).toEqual([1, 3, 5, 7, 9]);
    expect(document().entries.remaining).toBe(0);

    // Undoing turn 9 keeps it as the first undone turn; the client then has it in full.
    setDocument(session({entries: page([turnAt(7)], 5, 3), undone: page([turnAt(9)], 7)}));
    expect(shown()).toEqual([1, 3, 5, 7]);
    expect(undone()).toEqual([9]);

    // Undone turns beyond the window stay too, so what the client undid itself is there to redo.
    setDocument(session({entries: page([turnAt(1), turnAt(3)]), undone: page([turnAt(5), turnAt(7), turnAt(9)], 3, 1)}));
    setDocument(session({entries: page([turnAt(1)]), undone: page([turnAt(3), turnAt(5)], 1, 3)}));
    expect(shown()).toEqual([1]);
    expect(undone()).toEqual([3, 5, 7, 9]);
    expect(document().undone.remaining).toBe(1);
    // A page of later undone turns extends the back the same way.
    addHistoryPage("session-1", "undone", 9, page([turnAt(11)], 9));
    expect(undone()).toEqual([3, 5, 7, 9, 11]);
    expect(document().undone.remaining).toBe(0);
    expect(document().undone.precedingEntryId).toBe(1);

    // A window starting the history (a send after undoing every turn) replaces it.
    setDocument(session({entries: page([turnAt(20)])}));
    expect(shown()).toEqual([20]);
  });

  it.each([0, 2])("keeps a loaded oversized turn when a new window starts after it (%i earlier turns)", (remaining) => {
    const {setDocument} = useSessionsStore.getState();
    const answer = transcript([assistantEntry("x".repeat(6 * 1024 * 1024))], {firstId: 6})[0]!;
    const loaded = page([turnAt(5), answer], remaining === 0 ? null : 4, remaining);
    setDocument(session({entries: loaded}));
    const window = session({entries: page([turnAt(7)], 6, remaining + 1), runStart: 7});

    setDocument(window);

    const document = useSessionsStore.getState().documents["session-1"]!;
    expect(document.entries.items.map((item) => item.id)).toEqual([5, 6, 7]);
    expect(document.entries.items[1]).toBe(answer);
    expect(document.entries).toMatchObject({remaining, precedingEntryId: loaded.precedingEntryId});
    expect(live("session-1", document)).toMatchObject({turnIds: ["5"], liveTurn: {id: "7"}});

    setDocument({...window, live: runningLive()});
    expect(useSessionsStore.getState().documents["session-1"]!.entries).toBe(document.entries);
  });

  it.each([
    {name: "send after undo", precedingEntryId: 1, remaining: 1, expected: [1, 9]},
    {name: "missed update", precedingEntryId: 7, remaining: 3, expected: [9]},
    {name: "history restart", precedingEntryId: null, remaining: 0, expected: [9]},
  ])("connects a disjoint window only at its known boundary: $name", ({precedingEntryId, remaining, expected}) => {
    const {setDocument} = useSessionsStore.getState();
    setDocument(session({entries: page([turnAt(1)]), undone: page([turnAt(3), turnAt(5)], 1)}));

    setDocument(session({entries: {items: [turnAt(9)], remaining, precedingEntryId}}));

    const document = useSessionsStore.getState().documents["session-1"]!;
    expect(document.entries.items.map((item) => item.id)).toEqual(expected);
    expect(document.entries.remaining).toBe(expected.length === 2 ? 0 : remaining);
    expect(document.undone.items).toEqual([]);
  });

  it.each(["entries", "undone"] as const)("keeps loaded %s stable across live-only updates", (side) => {
    const {setDocument, addHistoryPage} = useSessionsStore.getState();
    const window = session({[side]: page([turnAt(5), turnAt(7)], side === "entries" ? 3 : null, 2)});
    setDocument(window);
    addHistoryPage("session-1", side, side === "entries" ? 5 : 7, page(side === "entries" ? [turnAt(1), turnAt(3)] : [turnAt(9), turnAt(11)]));
    const before = useSessionsStore.getState().documents["session-1"]!;
    const beforeView = live("session-1", before);

    setDocument({...window, live: runningLive()});

    const after = useSessionsStore.getState().documents["session-1"]!;
    expect(after[side], "merging the server window must not invalidate unchanged loaded history").toBe(before[side]);
    expect(live("session-1", after)[side === "entries" ? "turns" : "undoneTurns"]).toBe(beforeView[side === "entries" ? "turns" : "undoneTurns"]);
    expect(after.live).not.toBe(before.live);
  });

  it.each(["entries", "undone"] as const)("accepts a changed %s payload even when its entry id is unchanged", (side) => {
    const {setDocument} = useSessionsStore.getState();
    const window = session({[side]: page([turnAt(5)])});
    setDocument(window);
    const changed = {...window[side].items[0]!, contentParts: [{type: "text", text: "Changed"}] as const};

    setDocument({...window, [side]: page([changed])});

    expect(useSessionsStore.getState().documents["session-1"]![side].items[0]).toBe(changed);
  });

  it("shows what the runtime's status reports, with no optimism, until the document says otherwise", async () => {
    const {services} = setup();

    await setStatuses(services, {"session-1": entry({activity: "running"}), "session-2": entry({setupStep: "worktree"})});
    expect(live("session-1", null)).toMatchObject({status: "streaming"});
    expect(live("session-2")).toMatchObject({setupStep: "worktree", status: "idle"});

    await setStatuses(services, {"session-1": entry({activity: "compacting"}), "session-2": entry()});
    expect(live("session-1", null)).toMatchObject({status: "compacting"});
    expect(live("session-2")).toMatchObject({setupStep: null, status: "idle"});
    expect(useSessionsStore.getState().optimism).toEqual({});

    // Status replicates apart from the document; a known document is the source so status and content never
    // disagree within one update.
    expect(live()).toMatchObject({status: "idle"});
    expect(live("session-2", session({id: "session-2", live: runningLive()}))).toMatchObject({status: "streaming"});
  });

  it("lists the live listing with renames and pins not yet applied, in listing order", () => {
    const items = [listed("session-1", "New", "t3"), listed("session-3", "Untouched", "t0"), listed("session-4", "Unpinning", "t0", true)];
    const optimism = {"session-3": {pinned: true, title: "Renaming"}, "session-4": {pinned: false}};

    expect(listedSessions({items, optimism, projectPath: "/workspace", starting: []}).map((session) => [session.id, session.title, session.pinned])).toEqual([
      ["session-3", "Renaming", true],
      ["session-1", "New", false],
      ["session-4", "Unpinning", false],
    ]);
  });

  it("shows a session this client is starting until the listing has it, in its project only", () => {
    const optimism = {"session-2": {message: {id: "m", contentParts, timestamp: "t2"}}, elsewhere: {message: {id: "m", contentParts, timestamp: "t9"}}};
    const starting = [listed("session-2", "Just created", "t2"), listed("elsewhere", "Elsewhere", "t9", false, "/other")];
    const items = [listed("session-1", "One", "t1")];

    expect(listedSessions({items, optimism, projectPath: "/workspace", starting}).map((session) => session.id)).toEqual(["session-2", "session-1"]);
    expect(listedSessions({items: [listed("session-2", "Just created", "t2"), ...items], optimism, projectPath: "/workspace", starting}).map((session) => session.id)).toEqual([
      "session-2",
      "session-1",
    ]);
  });

  it("leaves a session being archived out", () => {
    const items = [listed("session-1", "One", "t1"), listed("session-3", "Three", "t0")];

    expect(listedSessions({items, optimism: {"session-1": {archived: true}}, projectPath: "/workspace", starting: []}).map((session) => session.id)).toEqual(["session-3"]);
  });

  it("shows a sent message until the send resolves", async () => {
    const {actions, services} = setup();
    let accept!: () => void;
    services.chat.sendMessage = vi.fn(() => new Promise<typeof ok>((resolve) => (accept = () => resolve(ok))));

    actions.sendMessage({contentParts, modelReference: model, sessionId: "session-1"});

    expect(live()).toMatchObject({liveMessage: contentParts, status: "streaming"});
    await waitUntil(() => expect(services.chat.sendMessage).toHaveBeenCalledWith({captureCheckpoints: true, contentParts, modelReference: model}));
    accept();
    await waitUntil(() => expect(live()).toMatchObject({liveMessage: undefined, status: "idle"}));
  });

  it("shows a new authored turn after undo without splitting extension continuations", async () => {
    const {actions, document, open, services} = setup();
    const initial = session({entries: page([turnAt(1)]), undone: page([turnAt(3), turnAt(5)], 1)});
    services.documents.set("session-1", fakeState(initial));
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
    await served.replace({...initial, entries: page([...initial.entries.items, ...continuation])});
    expect(live("session-1", document("session-1"))).toMatchObject({liveMessage: contentParts, turnIds: ["1"]});
    expect(useSessionsStore.getState().optimism["session-1"]?.message).toBeDefined();

    await served.replace(session({entries: page([...served.value!.entries.items, {...turnAt(7), contentParts}]), runStart: 7}));
    expect(live("session-1", document("session-1"))).toMatchObject({liveMessage: contentParts, liveTurn: {id: "7"}, turnIds: ["1"], undoneTurns: []});
    accept();
    await waitUntil(() => expect(useSessionsStore.getState().optimism["session-1"]?.message).toBeUndefined());
    expect(live("session-1", document("session-1")).undoneTurns).toEqual([]);
  });

  it("restores undone turns, drops the sent message, and reports the error when the send fails", async () => {
    const {actions, document, open, services} = setup();
    const initial = undoneLast(twoTurns());
    services.documents.set("session-1", fakeState(initial));
    open("session-1");
    await waitUntil(() => expect(document("session-1")).toEqual(initial));
    const undoneTurns = live("session-1", document("session-1")).undoneTurns;
    services.chat.sendMessage = vi.fn(async () => failure("GenericError", "Model unavailable"));

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
      return decision === "failed retry" ? failure("GenericError", "Restore failed") : ok;
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
    services.documents.set("session-1", fakeState(before));
    open("session-1");
    await waitUntil(() => expect(document("session-1")).toEqual(before));
    let reply!: () => void;
    services.chat[NAVIGATION_METHODS[navigation.action]] = vi.fn(() => new Promise<typeof ok>((resolve) => (reply = () => resolve(ok))));

    const outcome = actions.navigateCheckpoint({...navigation, sessionId: "session-1"});
    expect(live("session-1", document("session-1"))).toMatchObject({turnIds: shown});

    // The runtime publishes the navigated document first; the reply follows.
    await waitUntil(() => expect(services.chat[NAVIGATION_METHODS[navigation.action]]).toHaveBeenCalledOnce());
    await services.documents.get("session-1")!.replace(after);
    expect(live("session-1", document("session-1"))).toMatchObject({turnIds: shown});
    reply();
    await expect(outcome).resolves.toEqual({status: "applied"});
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
    const {actions, document, services} = setup();
    let resolveCreate!: () => void;
    services.sessions.create = vi.fn(
      (payload: Parameters<FakeServices["sessions"]["create"]>[0]) =>
        new Promise<{readonly ok: true; readonly value: Session}>((resolve) => {
          resolveCreate = () => resolve({ok: true, value: session({id: payload.id, entries: page([{...turnAt(1), contentParts}])})});
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
    expect(useSessionsStore.getState().records["new-session"]).toMatchObject({id: "new-session", projectPath: "/workspace", title: "Untitled session"});
    expect(live("new-session")).toMatchObject({liveMessage: contentParts, setupStep: "worktree", status: "streaming"});
    resolveCreate();
    await expect(pending).resolves.toEqual({status: "started"});
    expect(live("new-session")).toMatchObject({liveMessage: undefined, setupStep: null});
  });

  it("removes every trace of a new session the server could not create", async () => {
    const {actions, document, services} = setup();
    services.sessions.create = vi.fn(async () => failure("CreateSessionError", "Worktree could not be created."));

    const outcome = await actions.startSession({contentParts, modelReference: model, projectPath: "/workspace", sessionId: "new-session", workspace: {mode: "local"}});

    expect(outcome).toEqual({message: "Worktree could not be created.", status: "failed"});
    expect(document("new-session")).toBeUndefined();
    expect(useSessionsStore.getState().optimism["new-session"]).toBeUndefined();
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
    // The abort answered, but the directory still says running: the stop stays shown.
    await new Promise((resolve) => setTimeout(resolve, 20));
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
    services.documents.set("session-1", fakeState(session()));
    open("session-1");
    const stopMarking = markSeenAsItChanges("session-1");
    await waitUntil(() => expect(document("session-1")).toBeDefined());

    await services.documents.get("session-1")!.change((draft) => {
      draft.updatedAt = "2026-01-01T00:05:00.000Z";
    });

    expect(useSessionVisitsStore.getState().visits["session-1"]).toBe("2026-01-01T00:05:00.000Z");
    expect(hasUnseenActivity({activityAtMs: Date.parse("2026-01-01T00:09:00.000Z"), visitedAt: useSessionVisitsStore.getState().visits["session-1"]})).toBe(true);
    stopMarking();
  });

  it("moves a pin at once and keeps it until the runtime confirms", () => {
    const listing = {items: [listed("newer", "newer", "t2"), listed("older", "older", "t1")]};
    const order = () =>
      listedSessions({items: listing.items, optimism: useSessionsStore.getState().optimism, projectPath: "/workspace", starting: []}).map((session) => session.id);
    const {patchOptimism} = useSessionsStore.getState();

    patchOptimism("older", {pinned: true});
    expect(order()).toEqual(["older", "newer"]);
    // The listing reports the pin, then the mutation settles: the order never flips back.
    listing.items = [listed("older", "older", "t1", true), listed("newer", "newer", "t2")];
    expect(order()).toEqual(["older", "newer"]);
    patchOptimism("older", {pinned: undefined});
    expect(order()).toEqual(["older", "newer"]);
  });
});
