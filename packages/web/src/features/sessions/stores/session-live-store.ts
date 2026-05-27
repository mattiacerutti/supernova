import type {QueryClient} from "@tanstack/react-query";
import type {SessionStreamEvent} from "@supernova/contracts/sessions/procedures";
import type {ModelReference, Session, SessionSummary, Turn, UserMessageContentPart, UserMessage} from "@supernova/contracts/sessions/schemas";
import type {ProjectSessionsListResult} from "@supernova/contracts/projects/procedures";
import {create} from "zustand";
import {Effect, Stream} from "effect";
import {allProjectSessionsQueryKey, listProjectSessionsQueryKey} from "@/features/projects/hooks/api/use-list-project-sessions";
import {sessionQueryKey} from "@/features/sessions/hooks/api/use-session";
import type {AgentRpcClientApi, AgentRpcClientFiber} from "@/rpc/agent-rpc-client";

export type SessionLiveStatus = "idle" | "streaming" | "stopping";

export interface SessionLiveState {
  /** Whether Pi has an active agent run for this session. */
  readonly agentStreaming: boolean;
  /** Whether Pi is currently compacting this session context. */
  readonly compacting: boolean;
  readonly error: string | null;
  /** Currently streaming turn, kept separate from committed turns until a server snapshot commits it. */
  readonly liveTurn: Turn | null;
  /** Blocks sends in the gap after overflow compaction schedules continuation and before the next agent start. */
  readonly pendingContinuation: boolean;
  /** Latest server revision applied for this session. Older session-scoped events are ignored. */
  readonly revision: number;
  /** Derived status that drives composer buttons and duplicate-send prevention. */
  readonly status: SessionLiveStatus;
  /** Explicit stop request is in flight; keeps the UI disabled until server events/snapshots catch up. */
  readonly stopInProgress: boolean;
}

let fiber: AgentRpcClientFiber | null = null;
let isConnecting = false;
let reconnectTimer: number | null = null;

/** Creates an optimistic local turn so the user message appears before the first runtime snapshot. */
function createInitialStreamTurn(input: {contentParts: readonly UserMessageContentPart[]; model: ModelReference}): Turn {
  const timestamp = new Date().toISOString();
  const localMessage: UserMessage = {contentParts: input.contentParts, id: `msg_${crypto.randomUUID()}`, timestamp};
  return {events: [], id: localMessage.id, model: input.model, startedAt: timestamp, status: "streaming", userMessage: localMessage};
}

/** Creates baseline event-derived state for sessions first seen from the global stream. */
function emptyEntry(input: {revision: number}): SessionLiveState {
  return {
    agentStreaming: false,
    compacting: false,
    error: null,
    liveTurn: null,
    pendingContinuation: false,
    revision: input.revision,
    status: "idle",
    stopInProgress: false,
  };
}

/** Derives the legacy composer status from event-derived lifecycle flags. */
function toStatus(entry: Omit<SessionLiveState, "status">): SessionLiveStatus {
  if (entry.stopInProgress) return "stopping";
  return entry.agentStreaming || entry.compacting || entry.pendingContinuation || entry.liveTurn !== null ? "streaming" : "idle";
}

/** Applies metadata-only session updates to the visible session query. */
function applySessionSummary(input: {queryClient: QueryClient; sessionId: string; summary: SessionSummary}): void {
  const {queryClient, sessionId, summary} = input;
  queryClient.setQueryData<Session>(sessionQueryKey(sessionId), (session) => (session ? {...session, title: summary.title, updatedAt: summary.updatedAt} : session));
}

/** Writes an authoritative session snapshot into React Query and the project session list. */
function applySessionSnapshot(input: {queryClient: QueryClient; snapshot: Extract<SessionStreamEvent, {type: "session.snapshot"}>}): void {
  const {queryClient, snapshot} = input;
  queryClient.setQueryData<Session>(sessionQueryKey(snapshot.sessionId), snapshot.session);
  queryClient.setQueriesData<ProjectSessionsListResult>({queryKey: listProjectSessionsQueryKey(snapshot.session.projectPath)}, (result) => {
    if (!result) return result;

    const summary = {id: snapshot.session.id, title: snapshot.session.title, updatedAt: snapshot.session.updatedAt};
    const sessionExists = result.sessions.some((session) => session.id === snapshot.sessionId);
    const sessions = sessionExists ? result.sessions.map((session) => (session.id === snapshot.sessionId ? summary : session)) : [summary, ...result.sessions];
    return {...result, sessions};
  });
}

/** Guards against stale session-scoped events arriving after a newer revision was applied. */
function shouldIgnoreEvent(entry: SessionLiveState | undefined, revision: number): boolean {
  return Boolean(entry && revision <= entry.revision);
}

interface SendSessionMessageInput {
  readonly contentParts: readonly UserMessageContentPart[];
  readonly model: ModelReference;
  readonly rpcClient: AgentRpcClientApi;
  readonly sessionId: string;
}

interface CompactSessionInput {
  readonly model: ModelReference;
  readonly rpcClient: AgentRpcClientApi;
  readonly sessionId: string;
}

interface ConnectInput {
  readonly queryClient: QueryClient;
  readonly rpcClient: AgentRpcClientApi;
}

interface SessionLiveStoreState {
  readonly sessions: Record<string, SessionLiveState | undefined>;
  readonly abortSession: (input: {rpcClient: AgentRpcClientApi; sessionId: string}) => void;
  readonly compactSession: (input: CompactSessionInput) => void;
  readonly connect: (input: ConnectInput) => void;
  readonly disconnect: () => void;
  readonly sendMessage: (input: SendSessionMessageInput) => void;
}

export const useSessionLiveStore = create<SessionLiveStoreState>()((set, get) => {
  /** Applies one snapshot to both React Query committed state and Zustand live state. */
  const flushSnapshot = (queryClient: QueryClient, snapshot: Extract<SessionStreamEvent, {type: "session.snapshot"}>): void => {
    if (shouldIgnoreEvent(get().sessions[snapshot.sessionId], snapshot.revision)) return;

    applySessionSnapshot({queryClient, snapshot});
    updateLifecycle(snapshot.sessionId, snapshot.revision, (entry) => ({
      ...entry,
      agentStreaming: false,
      compacting: false,
      liveTurn: null,
      pendingContinuation: false,
      stopInProgress: false,
    }));
  };

  /** Applies one lifecycle update while preserving monotonic per-session revision order. */
  const updateLifecycle = (sessionId: string, revision: number, update: (entry: SessionLiveState) => Omit<SessionLiveState, "status">): void => {
    set((state) => {
      const current = state.sessions[sessionId];
      if (shouldIgnoreEvent(current, revision)) return state;

      const base = current ?? emptyEntry({revision: 0});
      const next = update({...base, revision});
      return {sessions: {...state.sessions, [sessionId]: {...next, status: toStatus(next)}}};
    });
  };

  /** Applies global stream events to event-derived session state and committed query data. */
  const handleEvent = (input: {event: SessionStreamEvent; queryClient: QueryClient}): void => {
    const {event, queryClient} = input;

    switch (event.type) {
      case "connected":
        // A fresh global stream may have missed prior events. Refetch known query data to repair state.
        void queryClient.invalidateQueries({queryKey: ["session"]});
        void queryClient.invalidateQueries({queryKey: allProjectSessionsQueryKey()});
        return;
      case "heartbeat":
      case "server.disposed":
        return;
      case "session.agent.started":
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, agentStreaming: true, error: null, pendingContinuation: false, stopInProgress: false}));
        return;
      case "session.agent.ended":
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, agentStreaming: false}));
        return;
      case "session.compaction.started":
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, compacting: true}));
        return;
      case "session.compaction.ended":
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, compacting: false, pendingContinuation: event.willContinue}));
        return;
      case "session.snapshot":
        flushSnapshot(queryClient, event);
        return;
      case "session.turn":
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, error: null, liveTurn: event.turn, stopInProgress: false}));
        return;
      case "session.updated":
        applySessionSummary({queryClient, sessionId: event.sessionId, summary: event.summary});
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry}));
        return;
      case "session.error":
        updateLifecycle(event.sessionId, event.revision, (entry) => ({
          ...entry,
          agentStreaming: false,
          error: event.error,
          liveTurn: null,
          pendingContinuation: false,
          stopInProgress: false,
        }));
        return;
    }
  };

  const connect = (input: ConnectInput): void => {
    if (fiber || isConnecting) return;

    const start = (): void => {
      if (fiber || isConnecting) return;
      isConnecting = true;
      // The global subscription observes all sessions. Interrupting this browser fiber only unsubscribes the client;
      // active Pi work remains owned by the server runtime.
      void input.rpcClient
        .fork((rpc) => rpc.watchEvents().pipe(Stream.runForEach((event) => Effect.sync(() => handleEvent({event, queryClient: input.queryClient})))))
        .then((newFiber) => {
          isConnecting = false;
          fiber = newFiber;
          void fiber.completed.then(() => {
            if (fiber !== newFiber) return;
            fiber = null;
            reconnectTimer = window.setTimeout(start, 1_000);
          });
        })
        .catch(() => {
          isConnecting = false;
          fiber = null;
          reconnectTimer = window.setTimeout(start, 1_000);
        });
    };

    start();
  };

  const disconnect = (): void => {
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);

    reconnectTimer = null;
    isConnecting = false;
    void fiber?.interrupt();
    fiber = null;
  };

  const sendMessage = (input: SendSessionMessageInput): void => {
    const {contentParts, model, rpcClient, sessionId} = input;

    const current = get().sessions[sessionId];
    if (current?.status === "streaming" || current?.status === "stopping") return;

    const liveTurn = createInitialStreamTurn({contentParts, model});
    // Optimistically show the user message in the live layer until the server emits authoritative events.
    set((state) => ({
      sessions: {...state.sessions, [sessionId]: {...emptyEntry({revision: 0}), agentStreaming: true, liveTurn, status: "streaming"}},
    }));

    void rpcClient
      .run((rpc) => rpc.sendMessage({contentParts, model, sessionId}))
      .catch((cause: unknown) => {
        // Command failures happen before work is accepted, for example invalid model/session errors.
        const error = cause instanceof Error ? cause.message : "Failed to send message.";
        set((state) => {
          const entry = state.sessions[sessionId];
          if (!entry) return state;
          const next = {...entry, agentStreaming: false, error, liveTurn: null, stopInProgress: false};
          return {sessions: {...state.sessions, [sessionId]: {...next, status: toStatus(next)}}};
        });
      });
  };

  const abortSession = (input: {rpcClient: AgentRpcClientApi; sessionId: string}): void => {
    const {rpcClient, sessionId} = input;
    const stream = get().sessions[sessionId];
    if (!stream || stream.status === "idle") return;

    const liveTurn = stream.liveTurn
      ? {...stream.liveTurn, completedAt: stream.liveTurn.completedAt ?? stream.liveTurn.events.at(-1)?.timestamp ?? new Date().toISOString(), status: "completed" as const}
      : null;

    set((state) => {
      const entry = state.sessions[sessionId];
      if (!entry) return state;
      return {sessions: {...state.sessions, [sessionId]: {...entry, liveTurn, status: "stopping", stopInProgress: true}}};
    });
    // Stop is the only client action that explicitly aborts server-owned Pi work.
    void rpcClient.run((rpc) => rpc.abortSession({sessionId})).catch(() => undefined);
  };

  const compactSession = (input: CompactSessionInput): void => {
    const {model, rpcClient, sessionId} = input;

    const current = get().sessions[sessionId];
    if (current?.status === "streaming" || current?.status === "stopping") return;

    set((state) => {
      const entry = state.sessions[sessionId] ?? emptyEntry({revision: 0});
      const next = {...entry, compacting: true, error: null};
      return {sessions: {...state.sessions, [sessionId]: {...next, status: toStatus(next)}}};
    });

    void rpcClient
      .run((rpc) => rpc.compactSession({model, sessionId}))
      .catch((cause: unknown) => {
        const error = cause instanceof Error ? cause.message : "Failed to compact session.";
        set((state) => {
          const entry = state.sessions[sessionId];
          if (!entry) return state;
          const next = {...entry, compacting: false, error};
          return {sessions: {...state.sessions, [sessionId]: {...next, status: toStatus(next)}}};
        });
      });
  };

  return {
    sessions: {},
    compactSession,
    connect,
    disconnect,
    sendMessage,
    abortSession,
  };
});
