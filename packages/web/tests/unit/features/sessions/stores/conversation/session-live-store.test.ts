import {replicatedState} from "@earendil-works/chord";
import type {MutableReplicatedState} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {ModelReference, Session, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import type {SessionDirectoryEntry, SessionDirectoryState} from "@supernova/contracts/sessions/services";
import {SessionController, SessionManagement} from "@supernova/contracts/sessions/services";
import {QueryClient} from "@tanstack/react-query";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {connectSessionEvents} from "@/features/sessions/api/conversation/session-events";
import {useSessionLiveStore} from "@/features/sessions/stores/conversation/session-live-store";
import {hasUnseenActivity, useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import type {RuntimeClient} from "@/rpc/transport/runtime-client";

const model = {
  id: "claude-sonnet",
  providerId: "anthropic",
  thinkingLevel: "high",
} satisfies ModelReference;

const contentParts = [{text: "Fix this", type: "text"}] satisfies readonly UserMessageContentPart[];
const ok = {ok: true, value: null} as const;

function session(input?: Partial<Session>): Session {
  return {
    id: "session-1",
    title: "Session",
    forked: false,
    projectPath: "/workspace",
    updatedAt: "2026-01-01T00:00:00.000Z",
    entries: [],
    undone: [],
    agent: {},
    live: {},
    usage: {models: {}, tools: {}},
    turns: {},
    context: {usedTokens: 0, contextWindow: 200_000},
    ...input,
  };
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
  readonly transcripts: Map<string, MutableReplicatedState<Session>>;
  readonly controller: {-readonly [K in keyof SessionController]: SessionController[K]};
  readonly management: {-readonly [K in keyof SessionManagement]: SessionManagement[K]};
  readonly attached: string[];
}

/** A session service client backed by local replicated state, as Chord's binding would expose the server's. */
function fakeServices(): FakeServices {
  const directory = replicatedState<SessionDirectoryState>({sessions: {}});
  const transcripts = new Map<string, MutableReplicatedState<Session>>();
  const attached: string[] = [];
  const controller = {
    abort: vi.fn(async () => ok),
    compact: vi.fn(async () => ok),
    redo: vi.fn(async () => ok),
    revert: vi.fn(async () => ok),
    send: vi.fn(async () => ok),
    undo: vi.fn(async () => ok),
  } as FakeServices["controller"];
  const management = {
    attach: vi.fn(async () => ok),
    create: vi.fn(async (payload) => ({ok: true, value: session({id: payload.id})}) as const),
    detach: vi.fn(async () => ok),
    fork: vi.fn(async () => ({ok: true, value: session()}) as const),
    read: vi.fn(async ({sessionId}) => ({ok: true, value: transcripts.get(sessionId)?.value ?? session({id: sessionId})}) as const),
    rename: vi.fn(async () => ({ok: true, value: session()}) as const),
  } as FakeServices["management"];
  // Only what the session store and events use; the other services are never reached.
  const client = {
    management,
    directory,
    attach: async (sessionId: string) => {
      attached.push(sessionId);
      let transcript = transcripts.get(sessionId);
      if (!transcript) {
        transcript = replicatedState(session({id: sessionId}));
        transcripts.set(sessionId, transcript);
      }
      return {controller, sessionId, transcript};
    },
    ready: async () => undefined,
    onConnectionChange: () => () => undefined,
    dispose: async () => undefined,
  } as unknown as RuntimeClient;
  return {attached, client, controller, directory, management, transcripts};
}

function setDirectory(services: FakeServices, sessions: Record<string, SessionDirectoryEntry>): void {
  services.directory.replace(BACKGROUND_CONTEXT, {sessions});
}

describe("session live store", () => {
  let disconnect = (): void => undefined;

  beforeEach(() => {
    disconnect();
    useSessionLiveStore.setState({activeSessionId: null, sessions: {}});
    useSessionVisitsStore.setState({visits: {}});
  });

  afterEach(() => {
    disconnect();
    disconnect = () => undefined;
    useSessionLiveStore.setState({activeSessionId: null, sessions: {}});
    useSessionVisitsStore.setState({visits: {}});
  });

  it("writes every value of the open session's replicated transcript into its cached document", async () => {
    const queryClient = new QueryClient();
    const services = fakeServices();
    services.transcripts.set("session-1", replicatedState(session()));
    disconnect = connectSessionEvents({queryClient, services: services.client});

    useSessionLiveStore.getState().setActiveSession("session-1");
    await waitUntil(() => expect(services.attached).toEqual(["session-1"]));
    await waitUntil(() => expect(queryClient.getQueryData(sessionKeys.detail("session-1"))).toEqual(session()));

    services.transcripts.get("session-1")!.change(BACKGROUND_CONTEXT, (draft) => {
      draft.title = "Renamed";
    });
    expect(queryClient.getQueryData<Session>(sessionKeys.detail("session-1"))?.title).toBe("Renamed");
  });

  it("takes every session's activity, setup step, and problems from the server's directory", async () => {
    const queryClient = new QueryClient();
    const services = fakeServices();
    disconnect = connectSessionEvents({queryClient, services: services.client});

    setDirectory(services, {"session-1": entry({activity: "running"}), "session-2": entry({setupStep: "worktree"})});
    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({activity: "running", status: "streaming"});
    expect(useSessionLiveStore.getState().sessions["session-2"]).toMatchObject({setupStep: "worktree", status: "idle"});

    setDirectory(services, {"session-1": entry({activity: "compacting"}), "session-2": entry({error: {at: "t1", message: "Worktree failed"}})});
    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({status: "compacting"});
    expect(useSessionLiveStore.getState().sessions["session-2"]).toMatchObject({error: "Worktree failed", setupStep: null, status: "idle"});
  });

  it("updates listed summaries when the directory changes a title", async () => {
    const queryClient = new QueryClient();
    const services = fakeServices();
    queryClient.setQueryData(sessionKeys.list("/workspace"), {
      projectPath: "/workspace",
      sessions: [{forked: false, id: "session-1", title: "Old", updatedAt: "t0", worktree: false}],
    });
    disconnect = connectSessionEvents({queryClient, services: services.client});

    setDirectory(services, {"session-1": entry({summary: {forked: false, id: "session-1", title: "New", updatedAt: "t1", worktree: false}})});

    expect(queryClient.getQueryData(sessionKeys.list("/workspace"))).toMatchObject({sessions: [{id: "session-1", title: "New"}]});
  });

  it("shows a sent message until the session's state holds its turn", async () => {
    const queryClient = new QueryClient();
    const services = fakeServices();
    queryClient.setQueryData(sessionKeys.detail("session-1"), session());

    useSessionLiveStore.getState().sendMessage({contentParts, modelReference: model, queryClient, services: services.client, sessionId: "session-1"});

    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({pending: {contentParts, turnCount: 0}, status: "streaming"});
    await waitUntil(() => expect(services.controller.send).toHaveBeenCalledWith({captureCheckpoints: true, contentParts, modelReference: model}, BACKGROUND_CONTEXT));
    useSessionLiveStore.getState().settlePending("session-1", 0);
    expect(useSessionLiveStore.getState().sessions["session-1"]?.pending).not.toBeNull();
    useSessionLiveStore.getState().settlePending("session-1", 1);
    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({pending: null, status: "idle"});
  });

  it("drops the sent message and reports the error when the send fails", async () => {
    const queryClient = new QueryClient();
    const services = fakeServices();
    services.controller.send = vi.fn(async () => failure("GenericError", "Model unavailable"));
    queryClient.setQueryData(sessionKeys.detail("session-1"), session());

    useSessionLiveStore.getState().sendMessage({contentParts, modelReference: model, queryClient, services: services.client, sessionId: "session-1"});

    await waitUntil(() => expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({error: "Model unavailable", pending: null, status: "idle"}));
  });

  it.each(
    [
      {outcome: "conflict", code: "CheckpointConflictError" as const},
      {outcome: "uncaptured", code: "CheckpointUncapturedError" as const},
    ].flatMap((item) => ["confirm", "cancel", "failed retry"].flatMap((decision) => (["undo", "redo", "revert"] as const).map((operation) => ({...item, decision, operation}))))
  )("keeps $operation optimistic on $outcome until $decision", async ({outcome, code, decision, operation}) => {
    const services = fakeServices();
    const forceFlags: Array<boolean | undefined> = [];
    services.controller[operation] = vi.fn(async (payload: {readonly force?: boolean}) => {
      forceFlags.push(payload.force);
      if (!payload.force) return failure(code, "Refused.");
      return decision === "failed retry" ? failure("GenericError", "Restore failed") : ok;
    });
    const input = {firstUndoneTurnId: "redoable", lastTurnId: "undone", queryClient: new QueryClient(), services: services.client, sessionId: "session-1", turnId: "undone"};
    const store = useSessionLiveStore.getState();
    const command = {redo: store.redoCheckpoint, revert: store.revertToMessage, undo: store.undoCheckpoint}[operation];
    const refused = await command(input);

    expect(typeof refused).toBe("object");
    if (typeof refused === "string") throw new Error("Expected confirmation.");
    expect(refused.reason).toBe(outcome);
    const target = operation === "redo" ? "redoable" : "undone";
    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({navigationTurnId: target, status: "checkpoint-navigating"});
    expect(await store.undoCheckpoint(input)).toBe("failed");

    if (decision === "cancel") {
      refused.cancel();
      expect(await refused.confirm()).toBe("failed");
      expect(forceFlags).toEqual([undefined]);
    } else {
      expect(await refused.confirm()).toBe(decision === "confirm" ? "applied" : "failed");
      expect(forceFlags).toEqual([undefined, true]);
    }
    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({navigationTurnId: null, status: "idle"});
  });

  it("shows a new session at once and creates it with its first message", async () => {
    const queryClient = new QueryClient();
    const services = fakeServices();

    const pending = useSessionLiveStore.getState().startSession({
      contentParts,
      modelReference: model,
      projectPath: "/workspace",
      queryClient,
      services: services.client,
      sessionId: "new-session",
      workspace: {baseRef: "main", mode: "worktree"},
    });

    expect(queryClient.getQueryData<Session>(sessionKeys.detail("new-session"))).toMatchObject({id: "new-session", entries: [], projectPath: "/workspace"});
    expect(useSessionLiveStore.getState().sessions["new-session"]).toMatchObject({pending: {contentParts}, setupStep: "worktree", status: "streaming"});
    await expect(pending).resolves.toEqual({status: "started"});
  });

  it("removes every trace of a new session the server could not create", async () => {
    const queryClient = new QueryClient();
    const services = fakeServices();
    services.management.create = vi.fn(async () => failure("CreateSessionError", "Worktree could not be created."));

    const outcome = await useSessionLiveStore.getState().startSession({
      contentParts,
      modelReference: model,
      projectPath: "/workspace",
      queryClient,
      services: services.client,
      sessionId: "new-session",
      workspace: {mode: "local"},
    });

    expect(outcome).toEqual({message: "Worktree could not be created.", status: "failed"});
    expect(queryClient.getQueryData(sessionKeys.detail("new-session"))).toBeUndefined();
    expect(useSessionLiveStore.getState().sessions["new-session"]).toBeUndefined();
  });

  it("guards session commands while work is active", () => {
    const services = fakeServices();
    useSessionLiveStore.getState().applyDirectory({sessions: {"session-1": entry({activity: "running"})}});

    useSessionLiveStore.getState().sendMessage({contentParts, modelReference: model, queryClient: new QueryClient(), services: services.client, sessionId: "session-1"});
    useSessionLiveStore.getState().compactSession({modelReference: model, services: services.client, sessionId: "session-1"});

    expect(services.controller.send).not.toHaveBeenCalled();
    expect(services.controller.compact).not.toHaveBeenCalled();
  });

  it("stops a running session until the server reports it idle", async () => {
    const services = fakeServices();
    useSessionLiveStore.getState().applyDirectory({sessions: {"session-1": entry({activity: "running"})}});

    useSessionLiveStore.getState().abortSession({services: services.client, sessionId: "session-1"});

    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({status: "stopping"});
    await waitUntil(() => expect(services.controller.abort).toHaveBeenCalledOnce());
    useSessionLiveStore.getState().applyDirectory({sessions: {"session-1": entry({activity: "idle"})}});
    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({command: null, status: "idle"});
  });

  it("stamps the open session as visited at its activity time, so later activity elsewhere stays unseen", async () => {
    const queryClient = new QueryClient();
    const services = fakeServices();
    services.transcripts.set("session-1", replicatedState(session()));
    disconnect = connectSessionEvents({queryClient, services: services.client});
    useSessionLiveStore.getState().setActiveSession("session-1");
    await waitUntil(() => expect(queryClient.getQueryData(sessionKeys.detail("session-1"))).toBeDefined());

    services.transcripts.get("session-1")!.change(BACKGROUND_CONTEXT, (draft) => {
      draft.updatedAt = "2026-01-01T00:05:00.000Z";
    });

    expect(useSessionVisitsStore.getState().visits["session-1"]).toBe("2026-01-01T00:05:00.000Z");
    expect(hasUnseenActivity({activityAtMs: Date.parse("2026-01-01T00:09:00.000Z"), visitedAt: useSessionVisitsStore.getState().visits["session-1"]})).toBe(true);
  });
});
