import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import {CheckpointConflictError, CheckpointUncapturedError} from "@supernova/contracts/session-runtime/procedures";
import type {ModelReference, Session, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {QueryClient} from "@tanstack/react-query";
import {Effect, Stream} from "effect";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {connectSessionEvents} from "@/features/sessions/api/conversation/session-events";
import {useSessionLiveStore} from "@/features/sessions/stores/conversation/session-live-store";
import {hasUnseenActivity, useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import type {RpcClient, RpcClientFiber, RpcProtocolClient} from "@/rpc/transport/protocol";

vi.mock("@/rpc/transport/client", () => ({
  RpcProtocolClientService: class RpcProtocolClientService {},
}));

const model = {
  id: "claude-sonnet",
  providerId: "anthropic",
  thinkingLevel: "high",
} satisfies ModelReference;

const contentParts = [{text: "Fix this", type: "text"}] satisfies readonly UserMessageContentPart[];

function session(input?: Partial<Session>): Session {
  return {
    id: "session-1",
    version: 10,
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

function createQueryClient(): QueryClient {
  return new QueryClient({defaultOptions: {queries: {retry: false}}});
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

function streamRpcClient(events: readonly SessionStreamEvent[]): RpcClient {
  return {
    dispose: vi.fn(async () => undefined),
    fork: vi.fn(async (execute) => {
      void Effect.runPromise(execute({watchEvents: () => Stream.fromIterable(events)} as unknown as RpcProtocolClient));
      return {completed: new Promise<void>(() => undefined), interrupt: vi.fn(async () => undefined)} satisfies RpcClientFiber;
    }),
    run: vi.fn(async () => undefined),
    runExit: vi.fn(),
  } as RpcClient;
}

function commandRpcClient(input?: {readonly rejectCreate?: boolean; readonly rejectNavigation?: boolean; readonly rejectSend?: boolean}): RpcClient {
  return {
    dispose: vi.fn(async () => undefined),
    fork: vi.fn(),
    run: vi.fn(async (execute) => {
      const protocol = {
        abortSession: () => Effect.void,
        compactSession: () => Effect.void,
        createSession: () => (input?.rejectCreate ? Effect.fail(new Error("Worktree could not be created.")) : Effect.succeed(session({id: "new-session", version: 3}))),
        redoCheckpoint: () => (input?.rejectNavigation ? Effect.fail(new Error("Checkpoint unavailable")) : Effect.void),
        revertToMessage: () => (input?.rejectNavigation ? Effect.fail(new Error("Checkpoint unavailable")) : Effect.void),
        sendMessage: () => (input?.rejectSend ? Effect.fail(new Error("Model unavailable")) : Effect.void),
        undoCheckpoint: () => (input?.rejectNavigation ? Effect.fail(new Error("Checkpoint unavailable")) : Effect.void),
      } as unknown as RpcProtocolClient;
      return await Effect.runPromise(execute(protocol));
    }),
    runExit: vi.fn(),
  } as RpcClient;
}

/** A delta that sets one top-level field and the version. */
function delta(revision: number, version: number, field: keyof Session, value: unknown, activity: "idle" | "running" | "compacting" = "running"): SessionStreamEvent {
  return {
    activity,
    ops: [
      ["s", [field], value as never],
      ["s", ["version"], version],
    ],
    revision,
    sessionId: "session-1",
    type: "session.state",
    version,
  };
}

describe("session live store", () => {
  let disconnect = (): void => undefined;

  beforeEach(() => {
    vi.stubGlobal("window", {clearTimeout, setTimeout});
    disconnect();
    useSessionLiveStore.setState({activeSessionId: null, sessions: {}});
    useSessionVisitsStore.setState({visits: {}});
  });

  afterEach(() => {
    disconnect();
    disconnect = () => undefined;
    useSessionLiveStore.setState({activeSessionId: null, sessions: {}});
    useSessionVisitsStore.setState({visits: {}});
    vi.unstubAllGlobals();
  });

  it("applies state deltas in version order to the cached session and ignores stale ones", async () => {
    const queryClient = createQueryClient();
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    queryClient.setQueryData(sessionKeys.detail("session-1"), session());
    const rpcClient = streamRpcClient([
      {type: "connected"},
      delta(1, 11, "title", "Running", "running"),
      delta(2, 11, "title", "Duplicate", "running"),
      delta(3, 12, "title", "Settled", "idle"),
    ]);

    disconnect = connectSessionEvents({queryClient, rpcClient});

    await waitUntil(() => {
      expect(queryClient.getQueryData(sessionKeys.detail("session-1"))).toEqual(session({title: "Settled", version: 12}));
      expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({activity: "idle", revision: 3, status: "idle"});
    });
  });

  it("refetches a cached session the stream has moved past instead of applying a delta to the wrong base", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    queryClient.setQueryData(sessionKeys.detail("session-1"), session());
    disconnect = connectSessionEvents({queryClient, rpcClient: streamRpcClient([{type: "connected"}, delta(1, 13, "title", "Ahead")])});

    await waitUntil(() => expect(invalidateQueries).toHaveBeenCalledWith({exact: true, queryKey: sessionKeys.detail("session-1")}));
    expect(queryClient.getQueryData<Session>(sessionKeys.detail("session-1"))?.title).toBe("Session");
  });

  it("derives the status from the server's activity", async () => {
    const queryClient = createQueryClient();
    disconnect = connectSessionEvents({
      queryClient,
      rpcClient: streamRpcClient([{type: "connected"}, delta(1, 1, "title", "x", "running"), delta(2, 2, "title", "y", "compacting")]),
    });

    await waitUntil(() => expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({status: "compacting"}));
  });

  it("tracks the setup step of a session being created until it ends or fails", async () => {
    const queryClient = createQueryClient();
    const rpcClient = streamRpcClient([
      {type: "connected"},
      {revision: 1, sessionId: "session-1", step: "worktree", type: "session.setup.started"},
      {revision: 2, sessionId: "session-1", step: "worktree", type: "session.setup.ended"},
      {revision: 3, sessionId: "session-2", step: "worktree", type: "session.setup.started"},
      {revision: 4, sessionId: "session-2", type: "session.error", error: "Worktree failed"},
      {revision: 5, sessionId: "session-3", step: "worktree", type: "session.setup.started"},
    ]);

    disconnect = connectSessionEvents({queryClient, rpcClient});

    await waitUntil(() => {
      expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({revision: 2, setupStep: null});
      expect(useSessionLiveStore.getState().sessions["session-2"]).toMatchObject({error: "Worktree failed", revision: 4, setupStep: null, status: "idle"});
      expect(useSessionLiveStore.getState().sessions["session-3"]).toMatchObject({revision: 5, setupStep: "worktree"});
    });
  });

  it("shows a sent message until the session's state holds its turn", () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(sessionKeys.detail("session-1"), session());

    useSessionLiveStore.getState().sendMessage({contentParts, modelReference: model, queryClient, rpcClient: commandRpcClient(), sessionId: "session-1"});

    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({pending: {contentParts, turnCount: 0}, status: "streaming"});
    useSessionLiveStore.getState().settlePending("session-1", 0);
    expect(useSessionLiveStore.getState().sessions["session-1"]?.pending).not.toBeNull();
    useSessionLiveStore.getState().settlePending("session-1", 1);
    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({pending: null, status: "idle"});
  });

  it("drops the sent message and reports the error when the send fails", async () => {
    const queryClient = createQueryClient();
    const previous = session();
    queryClient.setQueryData(sessionKeys.detail("session-1"), previous);

    useSessionLiveStore.getState().sendMessage({contentParts, modelReference: model, queryClient, rpcClient: commandRpcClient({rejectSend: true}), sessionId: "session-1"});

    await waitUntil(() => expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({error: "Model unavailable", pending: null, status: "idle"}));
    expect(queryClient.getQueryData(sessionKeys.detail("session-1"))).toBe(previous);
  });

  it.each(
    [
      {outcome: "conflict", error: new CheckpointConflictError({message: "Conflicting changes."})},
      {outcome: "uncaptured", error: new CheckpointUncapturedError({message: "No current snapshot."})},
    ].flatMap((item) =>
      ["confirm", "cancel", "failed retry"].flatMap((decision) => ["undoCheckpoint", "redoCheckpoint", "revertToMessage"].map((operation) => ({...item, decision, operation})))
    )
  )("keeps $operation optimistic on $outcome until $decision", async ({outcome, error, decision, operation}) => {
    const forceFlags: Array<boolean | undefined> = [];
    const rpcClient = {
      dispose: vi.fn(async () => undefined),
      fork: vi.fn(),
      run: vi.fn(async (execute) => {
        const protocol = {
          [operation]: (payload: {readonly force?: boolean}) => {
            forceFlags.push(payload.force);
            return payload.force ? (decision === "failed retry" ? Effect.fail(new Error("Restore failed")) : Effect.void) : Effect.fail(error);
          },
        } as unknown as RpcProtocolClient;
        return await Effect.runPromise(execute(protocol));
      }),
      runExit: vi.fn(),
    } as RpcClient;
    const queryClient = createQueryClient();
    const input = {firstUndoneTurnId: "redoable", lastTurnId: "undone", queryClient, rpcClient, sessionId: "session-1", turnId: "undone"};
    const store = useSessionLiveStore.getState();
    const refused = await (operation === "undoCheckpoint"
      ? store.undoCheckpoint(input)
      : operation === "redoCheckpoint"
        ? store.redoCheckpoint(input)
        : store.revertToMessage(input));

    expect(typeof refused).toBe("object");
    if (typeof refused === "string") throw new Error("Expected confirmation.");
    expect(refused.reason).toBe(outcome);
    const target = operation === "redoCheckpoint" ? "redoable" : "undone";
    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({navigationTurnId: target, status: "checkpoint-navigating"});
    expect(await store.undoCheckpoint(input)).toBe("failed");
    store.sendMessage({...input, contentParts, modelReference: model});
    expect(forceFlags).toEqual([undefined]);

    if (decision === "cancel") {
      refused.cancel();
      expect(await refused.confirm()).toBe("failed");
      expect(forceFlags).toEqual([undefined]);
    } else {
      expect(await refused.confirm()).toBe(decision === "confirm" ? "applied" : "failed");
      refused.cancel();
      expect(await refused.confirm()).toBe("failed");
      expect(forceFlags).toEqual([undefined, true]);
    }
    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({navigationTurnId: null, status: "idle"});
  });

  it("shows a new session at once and creates it with its first message", async () => {
    const queryClient = createQueryClient();
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    const pending = useSessionLiveStore.getState().startSession({
      contentParts,
      modelReference: model,
      projectPath: "/workspace",
      queryClient,
      rpcClient: commandRpcClient(),
      sessionId: "new-session",
      workspace: {mode: "local"},
    });

    expect(queryClient.getQueryData<Session>(sessionKeys.detail("new-session"))).toMatchObject({id: "new-session", projectPath: "/workspace", entries: []});
    expect(useSessionLiveStore.getState().sessions["new-session"]).toMatchObject({pending: {contentParts}, setupStep: null, status: "streaming"});
    await expect(pending).resolves.toEqual({status: "started"});
    expect(queryClient.getQueryData<Session>(sessionKeys.detail("new-session"))?.version).toBe(3);
  });

  it("shows the worktree step at once when a new session asks for one", async () => {
    const queryClient = createQueryClient();
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    const pending = useSessionLiveStore.getState().startSession({
      contentParts,
      modelReference: model,
      projectPath: "/workspace",
      queryClient,
      rpcClient: commandRpcClient(),
      sessionId: "new-session",
      workspace: {baseRef: "main", mode: "worktree"},
    });

    expect(useSessionLiveStore.getState().sessions["new-session"]).toMatchObject({setupStep: "worktree", status: "streaming"});
    await expect(pending).resolves.toEqual({status: "started"});
  });

  it("removes every trace of a new session the server could not create", async () => {
    const queryClient = createQueryClient();

    const outcome = await useSessionLiveStore.getState().startSession({
      contentParts,
      modelReference: model,
      projectPath: "/workspace",
      queryClient,
      rpcClient: commandRpcClient({rejectCreate: true}),
      sessionId: "new-session",
      workspace: {mode: "local"},
    });

    expect(outcome).toEqual({message: "Worktree could not be created.", status: "failed"});
    expect(queryClient.getQueryData(sessionKeys.detail("new-session"))).toBeUndefined();
    expect(useSessionLiveStore.getState().sessions["new-session"]).toBeUndefined();
  });

  it("rolls back an optimistic navigation the server rejects", async () => {
    useSessionLiveStore.getState().undoCheckpoint({
      firstUndoneTurnId: undefined,
      lastTurnId: "undone",
      queryClient: createQueryClient(),
      rpcClient: commandRpcClient({rejectNavigation: true}),
      sessionId: "session-1",
    });

    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({navigationTurnId: "undone", status: "checkpoint-navigating"});
    await waitUntil(() => expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({navigationTurnId: null, status: "idle"}));
  });

  it("guards session commands while work is active", () => {
    const rpcClient = commandRpcClient();
    useSessionLiveStore.getState().applyEvent(delta(1, 1, "title", "x", "running"));

    useSessionLiveStore.getState().sendMessage({contentParts, modelReference: model, queryClient: createQueryClient(), rpcClient, sessionId: "session-1"});
    useSessionLiveStore.getState().compactSession({modelReference: model, rpcClient, sessionId: "session-1"});
    useSessionLiveStore.getState().undoCheckpoint({firstUndoneTurnId: undefined, lastTurnId: undefined, queryClient: createQueryClient(), rpcClient, sessionId: "session-1"});

    expect(rpcClient.run).not.toHaveBeenCalled();
  });

  it("stops a running session until the server reports it idle", () => {
    const rpcClient = commandRpcClient();
    useSessionLiveStore.getState().applyEvent(delta(1, 1, "title", "x", "running"));

    useSessionLiveStore.getState().abortSession({rpcClient, sessionId: "session-1"});

    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({status: "stopping"});
    expect(rpcClient.run).toHaveBeenCalledOnce();
    useSessionLiveStore.getState().applyEvent(delta(2, 2, "title", "y", "idle"));
    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({command: null, status: "idle"});
  });

  it("stamps the open session as visited at its activity time, so later activity elsewhere stays unseen", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(sessionKeys.detail("session-1"), session());
    useSessionLiveStore.getState().setActiveSession("session-1");
    disconnect = connectSessionEvents({queryClient, rpcClient: streamRpcClient([{type: "connected"}, delta(1, 11, "updatedAt", "2026-01-01T00:05:00.000Z", "idle")])});

    await waitUntil(() => expect(useSessionVisitsStore.getState().visits["session-1"]).toBe("2026-01-01T00:05:00.000Z"));
    expect(hasUnseenActivity({activityAtMs: Date.parse("2026-01-01T00:09:00.000Z"), visitedAt: useSessionVisitsStore.getState().visits["session-1"]})).toBe(true);
  });
});
