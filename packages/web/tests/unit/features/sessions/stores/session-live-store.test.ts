import type {QueryClient} from "@tanstack/react-query";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {ModelReference, Session, SessionContextUsage, Turn, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {QueryClient as TanStackQueryClient} from "@tanstack/react-query";
import {Effect, Stream} from "effect";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {allSessionsQueryKey, sessionQueryKey} from "@/features/sessions/hooks/api/use-session";
import {connectSessionEvents} from "@/features/sessions/lib/streaming/session-event-stream";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import type {AgentRpcClientApi, AgentRpcClientFiber, AgentRpcProtocolClient} from "@/rpc/agent-rpc-client";

vi.mock("@/rpc/agent-rpc-client", () => ({
  AgentRpcProtocolClientService: class AgentRpcProtocolClientService {},
}));

const model = {
  id: "claude-sonnet",
  providerId: "anthropic",
  thinkingLevel: "high",
} satisfies ModelReference;

const contentParts = [{text: "Fix this", type: "text"}] satisfies readonly UserMessageContentPart[];
const contextUsage = {contextWindow: 200_000, usedTokens: 42_000} satisfies SessionContextUsage;

function turn(input?: Partial<Turn>): Turn {
  return {
    events: [],
    id: "turn-1",
    modelReference: model,
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "streaming",
    userMessage: {contentParts, id: "message-1", timestamp: "2026-01-01T00:00:00.000Z"},
    ...input,
  };
}

function session(input?: Partial<Session>): Session {
  return {
    id: "session-1",
    context: {usedTokens: 0, contextWindow: 200_000},
    projectPath: "/workspace",
    title: "Session",
    turns: [],
    undoneTurns: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...input,
  };
}

function createQueryClient(): QueryClient {
  return new TanStackQueryClient({defaultOptions: {queries: {retry: false}}});
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

function streamRpcClient(events: readonly SessionStreamEvent[]): AgentRpcClientApi {
  let interrupted = false;
  return {
    dispose: vi.fn(async () => undefined),
    fork: vi.fn(async (execute) => {
      void Effect.runPromise(execute({watchEvents: () => Stream.fromIterable(events)} as unknown as AgentRpcProtocolClient));
      return {
        completed: new Promise<void>(() => undefined),
        interrupt: vi.fn(async () => {
          interrupted = true;
        }),
      } satisfies AgentRpcClientFiber;
    }),
    run: vi.fn(async () => undefined),
    runExit: vi.fn(),
    get interrupted() {
      return interrupted;
    },
  } as AgentRpcClientApi & {readonly interrupted: boolean};
}

function commandRpcClient(input?: {readonly rejectNavigation?: boolean; readonly rejectSend?: boolean}): AgentRpcClientApi {
  return {
    dispose: vi.fn(async () => undefined),
    fork: vi.fn(),
    run: vi.fn(async (execute) => {
      const protocol = {
        abortSession: () => Effect.void,
        compactSession: () => Effect.void,
        redoCheckpoint: () => (input?.rejectNavigation ? Effect.fail(new Error("Checkpoint unavailable")) : Effect.void),
        revertToMessage: () => (input?.rejectNavigation ? Effect.fail(new Error("Checkpoint unavailable")) : Effect.void),
        sendMessage: () => (input?.rejectSend ? Effect.fail(new Error("Model unavailable")) : Effect.void),
        undoCheckpoint: () => (input?.rejectNavigation ? Effect.fail(new Error("Checkpoint unavailable")) : Effect.void),
      } as unknown as AgentRpcProtocolClient;
      return await Effect.runPromise(execute(protocol));
    }),
    runExit: vi.fn(),
  } as AgentRpcClientApi;
}

describe("session live store", () => {
  let disconnect = (): void => undefined;

  beforeEach(() => {
    vi.stubGlobal("window", {clearTimeout, setTimeout});
    disconnect();
    useSessionLiveStore.setState({sessions: {}});
  });

  afterEach(() => {
    disconnect();
    disconnect = () => undefined;
    useSessionLiveStore.setState({sessions: {}});
    vi.unstubAllGlobals();
  });

  it("applies stream events to live state and committed query data", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const committedSession = session({title: "Committed", turns: [turn({status: "completed"})], updatedAt: "2026-01-01T00:00:01.000Z"});
    const rpcClient = streamRpcClient([
      {type: "connected"},
      {revision: 1, sessionId: "session-1", type: "session.agent.started"},
      {revision: 2, sessionId: "session-1", context: contextUsage, turn: turn(), type: "session.turn"},
      {revision: 3, session: committedSession, sessionId: "session-1", type: "session.snapshot"},
      {revision: 2, sessionId: "session-1", context: contextUsage, turn: turn({id: "stale"}), type: "session.turn"},
    ]);

    disconnect = connectSessionEvents({queryClient, rpcClient});

    await waitUntil(() => {
      expect(queryClient.getQueryData(sessionQueryKey("session-1"))).toEqual(committedSession);
      expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({liveContext: null, liveTurn: null, revision: 3, status: "idle"});
    });
    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: allSessionsQueryKey()});
  });

  it("keeps threshold compaction status while live turn updates arrive", async () => {
    const queryClient = createQueryClient();
    const rpcClient = streamRpcClient([
      {type: "connected"},
      {revision: 1, sessionId: "session-1", type: "session.agent.started"},
      {revision: 2, sessionId: "session-1", context: contextUsage, turn: turn({id: "before-compaction"}), type: "session.turn"},
      {revision: 3, sessionId: "session-1", type: "session.compaction.started"},
      {revision: 4, sessionId: "session-1", context: {...contextUsage, usedTokens: null}, turn: turn({id: "during-compaction"}), type: "session.turn"},
    ]);

    disconnect = connectSessionEvents({queryClient, rpcClient});

    await waitUntil(() => {
      expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({
        liveContext: {contextWindow: 200_000, usedTokens: null},
        liveTurn: {id: "during-compaction"},
        status: "compacting",
      });
    });
  });

  it("clears stopped live turns when an authoritative snapshot arrives", async () => {
    const queryClient = createQueryClient();
    const stoppedTurn = turn({
      id: "optimistic-turn",
      status: "completed",
      userMessage: {contentParts, id: "optimistic-message", timestamp: "2026-01-01T00:00:00.000Z"},
    });
    const committedSession = session({
      turns: [
        turn({
          id: "committed-turn",
          status: "completed",
          userMessage: {contentParts, id: "committed-message", timestamp: "2026-01-01T00:00:00.000Z"},
        }),
      ],
    });
    const rpcClient = streamRpcClient([{type: "connected"}, {revision: 2, session: committedSession, sessionId: "session-1", type: "session.snapshot"}]);

    useSessionLiveStore.setState({
      sessions: {
        "session-1": {
          error: null,
          liveContext: contextUsage,
          liveTurn: stoppedTurn,
          revision: 1,
          status: "stopping",
        },
      },
    });

    disconnect = connectSessionEvents({queryClient, rpcClient});

    await waitUntil(() => {
      expect(queryClient.getQueryData(sessionQueryKey("session-1"))).toEqual(committedSession);
      expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({liveContext: null, liveTurn: null, status: "idle"});
    });
  });

  it("creates an optimistic turn and rolls back committed state when send fails", async () => {
    const queryClient = createQueryClient();
    const previousSession = session({undoneTurns: [turn({id: "undone"})]});
    const rpcClient = commandRpcClient({rejectSend: true});
    queryClient.setQueryData(sessionQueryKey("session-1"), previousSession);

    useSessionLiveStore.getState().sendMessage({contentParts, modelReference: model, queryClient, rpcClient, sessionId: "session-1"});

    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({status: "streaming"});
    expect(queryClient.getQueryData<Session>(sessionQueryKey("session-1"))?.undoneTurns).toEqual([]);

    await waitUntil(() => {
      expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({error: "Model unavailable", liveTurn: null, status: "idle"});
    });
    expect(queryClient.getQueryData(sessionQueryKey("session-1"))).toEqual(previousSession);
  });

  it("optimistically moves turns when navigating checkpoints and rolls back failures", async () => {
    const cases = [
      {
        name: "undo",
        run: (queryClient: QueryClient, rpcClient: AgentRpcClientApi) => useSessionLiveStore.getState().undoCheckpoint({queryClient, rpcClient, sessionId: "session-1"}),
        before: session({turns: [turn({id: "kept"}), turn({id: "undone"})], undoneTurns: [turn({id: "redoable"})]}),
        after: {turns: ["kept"], undoneTurns: ["undone", "redoable"]},
      },
      {
        name: "redo",
        run: (queryClient: QueryClient, rpcClient: AgentRpcClientApi) => useSessionLiveStore.getState().redoCheckpoint({queryClient, rpcClient, sessionId: "session-1"}),
        before: session({turns: [turn({id: "kept"})], undoneTurns: [turn({id: "restored"}), turn({id: "still-undone"})]}),
        after: {turns: ["kept", "restored"], undoneTurns: ["still-undone"]},
      },
      {
        name: "revert visible message",
        run: (queryClient: QueryClient, rpcClient: AgentRpcClientApi) =>
          useSessionLiveStore.getState().revertToMessage({queryClient, rpcClient, sessionId: "session-1", turnId: "reverted"}),
        before: session({turns: [turn({id: "kept"}), turn({id: "reverted"}), turn({id: "also-reverted"})], undoneTurns: [turn({id: "redoable"})]}),
        after: {turns: ["kept"], undoneTurns: ["reverted", "also-reverted", "redoable"]},
      },
      {
        name: "restore undone message",
        run: (queryClient: QueryClient, rpcClient: AgentRpcClientApi) =>
          useSessionLiveStore.getState().revertToMessage({queryClient, rpcClient, sessionId: "session-1", turnId: "restored"}),
        before: session({turns: [turn({id: "kept"})], undoneTurns: [turn({id: "restored-after"}), turn({id: "restored"}), turn({id: "still-undone"})]}),
        after: {turns: ["kept", "restored-after", "restored"], undoneTurns: ["still-undone"]},
      },
    ];

    for (const item of cases) {
      useSessionLiveStore.setState({sessions: {}});
      const queryClient = createQueryClient();
      queryClient.setQueryData(sessionQueryKey("session-1"), item.before);
      item.run(queryClient, commandRpcClient());

      expect(
        queryClient.getQueryData<Session>(sessionQueryKey("session-1"))?.turns.map((item) => item.id),
        item.name
      ).toEqual(item.after.turns);
      expect(
        queryClient.getQueryData<Session>(sessionQueryKey("session-1"))?.undoneTurns.map((item) => item.id),
        item.name
      ).toEqual(item.after.undoneTurns);
    }

    const queryClient = createQueryClient();
    const before = session({turns: [turn({id: "kept"}), turn({id: "undone"})]});
    queryClient.setQueryData(sessionQueryKey("session-1"), before);
    useSessionLiveStore.setState({sessions: {}});

    useSessionLiveStore.getState().undoCheckpoint({queryClient, rpcClient: commandRpcClient({rejectNavigation: true}), sessionId: "session-1"});

    expect(queryClient.getQueryData<Session>(sessionQueryKey("session-1"))?.turns.map((item) => item.id)).toEqual(["kept"]);
    await waitUntil(() => expect(queryClient.getQueryData(sessionQueryKey("session-1"))).toEqual(before));
  });

  it("guards session commands while work is active", () => {
    const rpcClient = commandRpcClient();
    useSessionLiveStore.setState({
      sessions: {"session-1": {error: null, liveContext: contextUsage, liveTurn: turn(), revision: 1, status: "streaming"}},
    });

    useSessionLiveStore.getState().sendMessage({contentParts, modelReference: model, queryClient: createQueryClient(), rpcClient, sessionId: "session-1"});
    useSessionLiveStore.getState().compactSession({modelReference: model, rpcClient, sessionId: "session-1"});
    useSessionLiveStore.getState().undoCheckpoint({queryClient: createQueryClient(), rpcClient, sessionId: "session-1"});

    expect(rpcClient.run).not.toHaveBeenCalled();
  });

  it("marks a streaming turn as stopping when aborting", () => {
    const rpcClient = commandRpcClient();
    useSessionLiveStore.setState({
      sessions: {"session-1": {error: null, liveContext: contextUsage, liveTurn: turn(), revision: 1, status: "streaming"}},
    });

    useSessionLiveStore.getState().abortSession({rpcClient, sessionId: "session-1"});

    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({status: "stopping"});
    expect(rpcClient.run).toHaveBeenCalledOnce();
  });
});
