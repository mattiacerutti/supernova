import {replicatedState} from "@earendil-works/chord";
import type {MutableReplicatedState} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {ModelReference, Session, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import type {SessionRuntimeService} from "@supernova/contracts/services/session-runtime/services";
import type {SessionDirectoryEntry, SessionDirectoryState, SessionsService} from "@supernova/contracts/services/sessions/services";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {sessionActions} from "@/features/sessions/api/conversation/session-commands";
import {followSession, markSeenAsItChanges, syncSessions} from "@/features/sessions/api/sessions-sync";
import {projectSessions, sessionView} from "@/features/sessions/lib/session-view";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {hasUnseenActivity, useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import type {RuntimeClient} from "@/runtime/transport/runtime-client";

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
 * with the store's directory entry and optimism.
 */
function live(sessionId = "session-1", document: Session | null = session({id: sessionId})) {
  const {entries, optimism} = useSessionsStore.getState();
  const view = sessionView({entry: entries[sessionId], optimism: optimism[sessionId], session: document ?? undefined});
  return {...view, liveMessage: view.liveTurn?.userMessage?.contentParts, turnIds: view.turns.map((turn) => turn.id)};
}

function session(input?: Partial<Session>): Session {
  return {
    id: "session-1",
    title: "Session",
    forked: false,
    pinned: false,
    projectPath: "/workspace",
    updatedAt: "2026-01-01T00:00:00.000Z",
    entries: [],
    undone: [],
    agent: {},
    live: {},
    usage: {models: {}, tools: {}},
    context: {usedTokens: 0, contextWindow: 200_000},
    ...input,
  };
}

/** A Pi user entry enriched with authored content, the start of a turn. */
function userEntry(id: number): Session["entries"][number] {
  return {
    conversationId: 1,
    id,
    kind: "pi.user",
    contentParts: [{text: `Turn ${id}`, type: "text"}],
    model: [{content: `Turn ${id}`, role: "user", timestamp: id}],
  } as unknown as Session["entries"][number];
}

/** A session with two turns, starting at entries 1 and 3. */
function twoTurns(): Session {
  return session({entries: [userEntry(1), userEntry(3)]});
}

/** The same session with its last turn undone. */
function undoneLast(document: Session): Session {
  return {...document, entries: document.entries.slice(0, 1), undone: document.entries.slice(1)};
}

function entry(input?: Partial<SessionDirectoryEntry>): SessionDirectoryEntry {
  return {activity: "idle", error: null, projectPath: "/workspace", setupStep: null, summary: null, ...input};
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
  readonly directory: MutableReplicatedState<SessionDirectoryState>;
  /** Each attached session's document. */
  readonly documents: Map<string, MutableReplicatedState<Session>>;
  readonly sessionRuntime: {-readonly [K in keyof Omit<SessionRuntimeService, "session">]: SessionRuntimeService[K]};
  readonly sessions: {-readonly [K in keyof Omit<SessionsService, "directory">]: SessionsService[K]};
  readonly attached: string[];
}

/**
 * A runtime client backed by local replicated state, as Chord's bindings expose the server's: `sessions.attach` routes
 * the connection to a session, and `bindSessionRuntime` points `sessionRuntime` at it.
 */
function fakeServices(): FakeServices {
  const directory = replicatedState<SessionDirectoryState>({sessions: {}});
  const documents = new Map<string, MutableReplicatedState<Session>>();
  const attached: string[] = [];
  let routed: string | undefined;
  let bound: MutableReplicatedState<Session> | undefined;
  const documentOf = (sessionId: string) => {
    let document = documents.get(sessionId);
    if (!document) {
      document = replicatedState(session({id: sessionId}));
      documents.set(sessionId, document);
    }
    return document;
  };
  const sessionRuntime = {
    abort: vi.fn(async () => ok),
    compact: vi.fn(async () => ok),
    redoCheckpoint: vi.fn(async () => ok),
    revertToMessage: vi.fn(async () => ok),
    sendMessage: vi.fn(async () => ok),
    undoCheckpoint: vi.fn(async () => ok),
  } as FakeServices["sessionRuntime"];
  const sessions = {
    attach: vi.fn(async (sessionId: string) => {
      attached.push(sessionId);
      routed = sessionId;
      return ok;
    }),
    create: vi.fn(async (payload) => ({ok: true, value: session({id: payload.id})}) as const),
    detach: vi.fn(async () => ok),
    fork: vi.fn(async () => ({ok: true, value: session()}) as const),
    get: vi.fn(async ({sessionId}) => ({ok: true, value: documents.get(sessionId)?.value ?? session({id: sessionId})}) as const),
    listComposerSuggestions: vi.fn(async () => ({ok: true as const, value: {items: []}})),
    listModels: vi.fn(async () => ({ok: true as const, value: []})),
    rename: vi.fn(async () => ({ok: true, value: session()}) as const),
  } as FakeServices["sessions"];
  // Only what the sessions feature uses; the other services are never reached.
  const client = {
    sessions: Object.assign(sessions, {directory}),
    // Looked up per call, so tests can replace a method after creating the client.
    sessionRuntime: new Proxy(sessionRuntime, {
      get: (target, member) => (member === "session" ? bound : target[member as keyof typeof target]),
    }),
    bindSessionRuntime: async () => {
      bound = routed === undefined ? undefined : documentOf(routed);
    },
    ready: async () => undefined,
    onConnectionChange: () => () => undefined,
    dispose: async () => undefined,
  } as unknown as RuntimeClient;
  return {attached, client, directory, documents, sessionRuntime, sessions};
}

function setDirectory(services: FakeServices, sessions: Record<string, SessionDirectoryEntry>): void {
  services.directory.replace(BACKGROUND_CONTEXT, {sessions});
}

describe("session commands and views", () => {
  let disconnect = (): void => undefined;

  beforeEach(() => {
    disconnect();
    useSessionsStore.setState({documents: {}, entries: {}, loadErrors: {}, optimism: {}});
    useSessionVisitsStore.setState({visits: {}});
  });

  afterEach(() => {
    disconnect();
    disconnect = () => undefined;
    useSessionsStore.setState({documents: {}, entries: {}, loadErrors: {}, optimism: {}});
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

  it("keeps every value of a followed session's replicated document in the store", async () => {
    const {document, open, services} = setup();
    services.documents.set("session-1", replicatedState(session()));

    open("session-1");
    await waitUntil(() => expect(services.attached).toEqual(["session-1"]));
    await waitUntil(() => expect(document("session-1")).toEqual(session()));

    services.documents.get("session-1")!.change(BACKGROUND_CONTEXT, (draft) => {
      draft.title = "Renamed";
    });
    expect(document("session-1")?.title).toBe("Renamed");
  });

  it("shows what the runtime's directory reports, with no optimism, until the document says otherwise", () => {
    const {services} = setup();

    setDirectory(services, {"session-1": entry({activity: "running"}), "session-2": entry({setupStep: "worktree"})});
    expect(live("session-1", null)).toMatchObject({status: "streaming"});
    expect(live("session-2")).toMatchObject({setupStep: "worktree", status: "idle"});

    setDirectory(services, {"session-1": entry({activity: "compacting"}), "session-2": entry({error: {at: "t1", message: "Worktree failed"}})});
    expect(live("session-1", null)).toMatchObject({status: "compacting"});
    expect(live("session-2")).toMatchObject({error: "Worktree failed", setupStep: null, status: "idle"});
    expect(useSessionsStore.getState().optimism).toEqual({});

    // The directory's activity replicates apart from the document; a known document is the source so status and
    // content never disagree within one update.
    expect(live()).toMatchObject({status: "idle"});
    expect(live("session-2", session({id: "session-2", live: {run: {}} as Session["live"]}))).toMatchObject({status: "streaming"});
  });

  it("lists loaded sessions with the runtime's newest summaries, new ones, and renames and pins not yet applied, in the runtime's order", () => {
    const summary = (id: string, title: string, updatedAt: string, pinned = false) => ({forked: false, id, pinned, title, updatedAt, worktree: false});
    const loaded = [summary("session-1", "Old", "t1"), summary("session-3", "Untouched", "t0"), summary("session-4", "Unpinning", "t0", true)];
    const entries = {
      "session-1": entry({summary: summary("session-1", "New", "t3")}),
      "session-2": entry({summary: summary("session-2", "Just created", "t2")}),
      elsewhere: entry({projectPath: "/other", summary: summary("elsewhere", "Other project", "t9")}),
    };
    const optimism = {"session-3": {pinned: true, title: "Renaming"}, "session-4": {pinned: false}};

    expect(projectSessions({entries, loaded, optimism, projectPath: "/workspace"}).map((session) => [session.id, session.title, session.pinned])).toEqual([
      ["session-3", "Renaming", true],
      ["session-1", "New", false],
      ["session-2", "Just created", false],
      ["session-4", "Unpinning", false],
    ]);
  });

  it("shows a sent message until the send resolves", async () => {
    const {actions, services} = setup();
    let accept!: () => void;
    services.sessionRuntime.sendMessage = vi.fn(() => new Promise<typeof ok>((resolve) => (accept = () => resolve(ok))));

    actions.sendMessage({contentParts, modelReference: model, sessionId: "session-1"});

    expect(live()).toMatchObject({liveMessage: contentParts, status: "streaming"});
    await waitUntil(() => expect(services.sessionRuntime.sendMessage).toHaveBeenCalledWith({captureCheckpoints: true, contentParts, modelReference: model}, BACKGROUND_CONTEXT));
    accept();
    await waitUntil(() => expect(live()).toMatchObject({liveMessage: undefined, status: "idle"}));
  });

  it("shows a new authored turn after undo without splitting extension continuations", async () => {
    const {actions, document, open, services} = setup();
    const initial = session({entries: [userEntry(1)], undone: [userEntry(3), userEntry(5)]});
    services.documents.set("session-1", replicatedState(initial));
    open("session-1");
    await waitUntil(() => expect(document("session-1")).toEqual(initial));
    let accept!: () => void;
    services.sessionRuntime.sendMessage = vi.fn(() => new Promise<typeof ok>((resolve) => (accept = () => resolve(ok))));

    actions.sendMessage({contentParts, modelReference: model, sessionId: "session-1"});
    await waitUntil(() => expect(services.sessionRuntime.sendMessage).toHaveBeenCalledOnce());
    const transcript = services.documents.get("session-1")!;
    const continuation = {conversationId: 1, id: 6, kind: "pi.user", model: [{content: "Continuation", role: "user", timestamp: 6}]} as unknown as Session["entries"][number];
    transcript.replace(BACKGROUND_CONTEXT, {...initial, entries: [...initial.entries, continuation]});
    expect(live("session-1", document("session-1"))).toMatchObject({liveMessage: contentParts, turnIds: ["1"]});
    expect(useSessionsStore.getState().optimism["session-1"]?.message).toBeDefined();

    transcript.replace(BACKGROUND_CONTEXT, session({entries: [...transcript.value!.entries, {...userEntry(7), contentParts}], runStart: 7}));
    expect(live("session-1", document("session-1"))).toMatchObject({liveMessage: contentParts, liveTurn: {id: "7"}, turnIds: ["1"], undoneTurns: []});
    accept();
    await waitUntil(() => expect(useSessionsStore.getState().optimism["session-1"]?.message).toBeUndefined());
  });

  it("drops the sent message and reports the error when the send fails", async () => {
    const {actions, services} = setup();
    services.sessionRuntime.sendMessage = vi.fn(async () => failure("GenericError", "Model unavailable"));

    actions.sendMessage({contentParts, modelReference: model, sessionId: "session-1"});

    await waitUntil(() => expect(live()).toMatchObject({error: "Model unavailable", liveMessage: undefined, status: "idle"}));
  });

  it("moves past the server's problem when the user starts a command, and shows a later one", () => {
    const {actions, services} = setup();
    setDirectory(services, {"session-1": entry({error: {at: "t1", message: "Extension failed"}})});
    expect(live().error).toBe("Extension failed");

    actions.sendMessage({contentParts, modelReference: model, sessionId: "session-1"});
    expect(live().error).toBeNull();

    setDirectory(services, {"session-1": entry({error: {at: "t2", message: "Unanswered input"}})});
    expect(live().error).toBe("Unanswered input");
  });

  it.each(
    [
      {outcome: "conflict", code: "CheckpointConflictError" as const},
      {outcome: "uncaptured", code: "CheckpointUncapturedError" as const},
    ].flatMap((item) => ["confirm", "cancel", "failed retry"].flatMap((decision) => (["undo", "redo", "revert"] as const).map((action) => ({...item, decision, action}))))
  )("holds $action optimistically on $outcome until $decision", async ({outcome, code, decision, action}) => {
    const {actions, services} = setup();
    const forceFlags: boolean[] = [];
    services.sessionRuntime[NAVIGATION_METHODS[action]] = vi.fn(async (payload: {readonly force?: boolean}) => {
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
    services.documents.set("session-1", replicatedState(before));
    open("session-1");
    await waitUntil(() => expect(document("session-1")).toEqual(before));
    let reply!: () => void;
    services.sessionRuntime[NAVIGATION_METHODS[navigation.action]] = vi.fn(() => new Promise<typeof ok>((resolve) => (reply = () => resolve(ok))));

    const outcome = actions.navigateCheckpoint({...navigation, sessionId: "session-1"});
    expect(live("session-1", document("session-1"))).toMatchObject({turnIds: shown});

    // The runtime publishes the navigated document first; the reply follows.
    await waitUntil(() => expect(services.sessionRuntime[NAVIGATION_METHODS[navigation.action]]).toHaveBeenCalledOnce());
    services.documents.get("session-1")!.replace(BACKGROUND_CONTEXT, after);
    expect(live("session-1", document("session-1"))).toMatchObject({turnIds: shown});
    reply();
    await expect(outcome).resolves.toEqual({status: "applied"});
    expect(live("session-1", document("session-1"))).toMatchObject({status: "idle", turnIds: shown});
  });

  it("reports a navigation the server rejects outright by its code", async () => {
    const {actions, services} = setup();
    services.sessionRuntime.undoCheckpoint = vi.fn(async () => failure("CheckpointInheritedError", "Inherited."));

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
          resolveCreate = () => resolve({ok: true, value: session({id: payload.id, entries: [{...userEntry(1), contentParts}]})});
        })
    );

    const pending = actions.startSession({
      contentParts,
      modelReference: model,
      projectPath: "/workspace",
      sessionId: "new-session",
      workspace: {baseRef: "main", mode: "worktree"},
    });

    expect(document("new-session")).toMatchObject({id: "new-session", entries: [], projectPath: "/workspace"});
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

  it("guards session commands while the server reports work", () => {
    const {actions, services} = setup();
    setDirectory(services, {"session-1": entry({activity: "running"})});

    actions.sendMessage({contentParts, modelReference: model, sessionId: "session-1"});
    actions.compactSession({modelReference: model, sessionId: "session-1"});

    expect(services.sessionRuntime.sendMessage).not.toHaveBeenCalled();
    expect(services.sessionRuntime.compact).not.toHaveBeenCalled();
  });

  it("shows a stop until the server reports the session idle", async () => {
    const {actions, services} = setup();
    setDirectory(services, {"session-1": entry({activity: "running"})});

    actions.abortSession("session-1");

    expect(live()).toMatchObject({status: "stopping"});
    await waitUntil(() => expect(services.sessionRuntime.abort).toHaveBeenCalledOnce());
    // The abort answered, but the directory still says running: the stop stays shown.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(live()).toMatchObject({status: "stopping"});
    setDirectory(services, {"session-1": entry({activity: "idle"})});
    await waitUntil(() => expect(live()).toMatchObject({status: "idle"}));
  });

  it("shows a compaction from the request until the server's compaction ends", async () => {
    const {actions, services} = setup();
    let finish!: () => void;
    services.sessionRuntime.compact = vi.fn(() => new Promise<typeof ok>((resolve) => (finish = () => resolve(ok))));

    actions.compactSession({modelReference: model, sessionId: "session-1"});

    expect(live()).toMatchObject({status: "compacting"});
    await waitUntil(() => expect(services.sessionRuntime.compact).toHaveBeenCalledOnce());
    finish();
    await waitUntil(() => expect(live()).toMatchObject({status: "idle"}));
  });

  it("stamps a followed session as visited at its activity time, so later activity elsewhere stays unseen", async () => {
    const {document, open, services} = setup();
    services.documents.set("session-1", replicatedState(session()));
    open("session-1");
    const stopMarking = markSeenAsItChanges("session-1");
    await waitUntil(() => expect(document("session-1")).toBeDefined());

    services.documents.get("session-1")!.change(BACKGROUND_CONTEXT, (draft) => {
      draft.updatedAt = "2026-01-01T00:05:00.000Z";
    });

    expect(useSessionVisitsStore.getState().visits["session-1"]).toBe("2026-01-01T00:05:00.000Z");
    expect(hasUnseenActivity({activityAtMs: Date.parse("2026-01-01T00:09:00.000Z"), visitedAt: useSessionVisitsStore.getState().visits["session-1"]})).toBe(true);
    stopMarking();
  });

  it("moves a pin at once and keeps it until the runtime confirms", async () => {
    const summary = (id: string, updatedAt: string, pinned = false) => ({forked: false, id, pinned, title: id, updatedAt, worktree: false});
    const loaded = [summary("newer", "t2"), summary("older", "t1")];
    const order = () =>
      projectSessions({entries: useSessionsStore.getState().entries, loaded, optimism: useSessionsStore.getState().optimism, projectPath: "/workspace"}).map(
        (session) => session.id
      );
    const {patchOptimism, setEntries} = useSessionsStore.getState();

    patchOptimism("older", {pinned: true});
    expect(order()).toEqual(["older", "newer"]);
    // The runtime reports the pin, then the mutation settles: the order never flips back.
    setEntries({older: entry({summary: summary("older", "t1", true)})});
    expect(order()).toEqual(["older", "newer"]);
    patchOptimism("older", {pinned: undefined});
    expect(order()).toEqual(["older", "newer"]);
  });
});
