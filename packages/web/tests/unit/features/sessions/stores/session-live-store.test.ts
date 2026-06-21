import type {QueryClient} from "@tanstack/react-query";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {ModelReference, Session, Turn, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {QueryClient as TanStackQueryClient} from "@tanstack/react-query";
import {Effect, Stream} from "effect";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {allSessionsQueryKey, sessionQueryKey} from "@/features/sessions/hooks/api/use-session";
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

function turn(input?: Partial<Turn>): Turn {
  return {
    events: [],
    id: "turn-1",
    model,
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

function commandRpcClient(input?: {readonly rejectSend?: boolean}): AgentRpcClientApi {
  return {
    dispose: vi.fn(async () => undefined),
    fork: vi.fn(),
    run: vi.fn(async (execute) => {
      const protocol = {
        abortSession: () => Effect.void,
        compactSession: () => Effect.void,
        redoCheckpoint: () => Effect.void,
        revertToMessage: () => Effect.void,
        sendMessage: () => (input?.rejectSend ? Effect.fail(new Error("Model unavailable")) : Effect.void),
        undoCheckpoint: () => Effect.void,
      } as unknown as AgentRpcProtocolClient;
      return await Effect.runPromise(execute(protocol));
    }),
    runExit: vi.fn(),
  } as AgentRpcClientApi;
}

describe("session live store", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {clearTimeout, setTimeout});
    useSessionLiveStore.getState().disconnect();
    useSessionLiveStore.setState({sessions: {}});
  });

  afterEach(() => {
    useSessionLiveStore.getState().disconnect();
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
      {revision: 2, sessionId: "session-1", turn: turn(), type: "session.turn"},
      {revision: 3, session: committedSession, sessionId: "session-1", type: "session.snapshot"},
      {revision: 2, sessionId: "session-1", turn: turn({id: "stale"}), type: "session.turn"},
    ]);

    useSessionLiveStore.getState().connect({queryClient, rpcClient});

    await waitUntil(() => {
      expect(queryClient.getQueryData(sessionQueryKey("session-1"))).toEqual(committedSession);
      expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({liveTurn: null, revision: 3, session: committedSession, status: "idle"});
    });
    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: allSessionsQueryKey()});
  });

  it("keeps threshold compaction status while live turn updates arrive", async () => {
    const queryClient = createQueryClient();
    const rpcClient = streamRpcClient([
      {type: "connected"},
      {revision: 1, sessionId: "session-1", type: "session.agent.started"},
      {revision: 2, sessionId: "session-1", turn: turn({id: "before-compaction"}), type: "session.turn"},
      {revision: 3, sessionId: "session-1", type: "session.compaction.started"},
      {revision: 4, sessionId: "session-1", turn: turn({id: "during-compaction"}), type: "session.turn"},
    ]);

    useSessionLiveStore.getState().connect({queryClient, rpcClient});

    await waitUntil(() => {
      expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({liveTurn: {id: "during-compaction"}, status: "compacting"});
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
          agentStreaming: true,
          error: null,
          session: session(),
          liveTurn: stoppedTurn,
          revision: 1,
          status: "stopping",
          stopInProgress: true,
        },
      },
    });

    useSessionLiveStore.getState().connect({queryClient, rpcClient});

    await waitUntil(() => {
      expect(queryClient.getQueryData(sessionQueryKey("session-1"))).toEqual(committedSession);
      expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({liveTurn: null, session: committedSession, status: "idle", stopInProgress: false});
    });
  });

  it("creates an optimistic turn and rolls back committed state when send fails", async () => {
    const queryClient = createQueryClient();
    const previousSession = session({undoneTurns: [turn({id: "undone"})]});
    const rpcClient = commandRpcClient({rejectSend: true});
    queryClient.setQueryData(sessionQueryKey("session-1"), previousSession);

    useSessionLiveStore.getState().sendMessage({contentParts, model, queryClient, rpcClient, sessionId: "session-1"});

    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({agentStreaming: true, status: "streaming"});
    expect(queryClient.getQueryData<Session>(sessionQueryKey("session-1"))?.undoneTurns).toEqual([]);

    await waitUntil(() => {
      expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({error: "Model unavailable", liveTurn: null, status: "idle"});
    });
    expect(queryClient.getQueryData(sessionQueryKey("session-1"))).toEqual(previousSession);
  });

  it("guards session commands while work is active", () => {
    const rpcClient = commandRpcClient();
    useSessionLiveStore.setState({
      sessions: {"session-1": {agentStreaming: true, error: null, session: null, liveTurn: turn(), revision: 1, status: "streaming", stopInProgress: false}},
    });

    useSessionLiveStore.getState().sendMessage({contentParts, model, queryClient: createQueryClient(), rpcClient, sessionId: "session-1"});
    useSessionLiveStore.getState().compactSession({model, rpcClient, sessionId: "session-1"});
    useSessionLiveStore.getState().undoCheckpoint({rpcClient, sessionId: "session-1"});

    expect(rpcClient.run).not.toHaveBeenCalled();
  });

  it("marks a streaming turn as stopping when aborting", () => {
    const rpcClient = commandRpcClient();
    useSessionLiveStore.setState({
      sessions: {"session-1": {agentStreaming: true, error: null, session: null, liveTurn: turn(), revision: 1, status: "streaming", stopInProgress: false}},
    });

    useSessionLiveStore.getState().abortSession({rpcClient, sessionId: "session-1"});

    expect(useSessionLiveStore.getState().sessions["session-1"]).toMatchObject({status: "stopping", stopInProgress: true});
    expect(rpcClient.run).toHaveBeenCalledOnce();
  });
});
