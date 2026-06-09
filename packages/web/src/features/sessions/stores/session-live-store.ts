import type {QueryClient} from "@tanstack/react-query";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {ModelReference, Session, SessionSummary, Turn, UserMessageContentPart, UserMessage} from "@supernova/contracts/sessions/schemas";
import type {ProjectSessionsListResult} from "@supernova/contracts/projects/procedures";
import {create} from "zustand";
import {Effect, Stream} from "effect";
import {showToast} from "@/components/ui/toast-manager";
import {allProjectSessionsQueryKey, listProjectSessionsQueryKey} from "@/features/projects/hooks/api/use-list-project-sessions";
import type {AgentRpcClientApi, AgentRpcClientFiber, AgentRpcProtocolClient} from "@/rpc/agent-rpc-client";

export type SessionLiveStatus = "checkpoint-navigating" | "compacting" | "idle" | "stopping" | "streaming";

export interface SessionLiveState {
  /** Whether Pi has an active agent run for this session. */
  readonly agentStreaming: boolean;
  readonly error: string | null;
  /** Latest committed session snapshot used by the active timeline. */
  readonly session: Session | null;
  /** Currently streaming turn, kept separate from committed turns until a server snapshot commits it. */
  readonly liveTurn: Turn | null;
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

function sessionQueryKey(sessionId: string) {
  return ["session", sessionId] as const;
}

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
    error: null,
    session: null,
    liveTurn: null,
    revision: input.revision,
    status: "idle",
    stopInProgress: false,
  };
}

/** Derives the legacy composer status from event-derived lifecycle flags. */
function toStatus(entry: Omit<SessionLiveState, "status">): SessionLiveStatus {
  if (entry.stopInProgress) return "stopping";
  return entry.agentStreaming || entry.liveTurn !== null ? "streaming" : "idle";
}

/** Normalizes command failures for user-facing toasts. */
function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.length > 0 ? cause.message : fallback;
}

/** Upserts session metadata into cached project session lists. */
function applyProjectSessionSummary(input: {projectPath: string; queryClient: QueryClient; sessionId: string; summary: SessionSummary}): void {
  const {projectPath, queryClient, sessionId, summary} = input;
  queryClient.setQueriesData<ProjectSessionsListResult>({queryKey: listProjectSessionsQueryKey(projectPath)}, (result) => {
    if (!result) return result;

    const sessionExists = result.sessions.some((session) => session.id === sessionId);
    const sessions = sessionExists ? result.sessions.map((session) => (session.id === sessionId ? summary : session)) : [summary, ...result.sessions];
    return {...result, sessions};
  });
}

/** Applies metadata-only session updates to visible session and project list queries. */
function applySessionSummary(input: {projectPath: string; queryClient: QueryClient; sessionId: string; summary: SessionSummary}): void {
  const {projectPath, queryClient, sessionId, summary} = input;
  queryClient.setQueryData<Session>(sessionQueryKey(sessionId), (session) => (session ? {...session, title: summary.title, updatedAt: summary.updatedAt} : session));
  applyProjectSessionSummary({projectPath, queryClient, sessionId, summary});
}

/** Writes an authoritative session snapshot into React Query and the project session list. */
function applySessionSnapshot(input: {queryClient: QueryClient; snapshot: Extract<SessionStreamEvent, {type: "session.snapshot"}>}): void {
  const {queryClient, snapshot} = input;
  queryClient.setQueryData<Session>(sessionQueryKey(snapshot.sessionId), snapshot.session);
  applyProjectSessionSummary({
    projectPath: snapshot.session.projectPath,
    queryClient,
    sessionId: snapshot.sessionId,
    summary: {id: snapshot.session.id, title: snapshot.session.title, updatedAt: snapshot.session.updatedAt},
  });
}

/** Guards against stale session-scoped events arriving after a newer revision was applied. */
function shouldIgnoreEvent(entry: SessionLiveState | undefined, revision: number): boolean {
  return Boolean(entry && revision <= entry.revision);
}

interface SendSessionMessageInput {
  readonly contentParts: readonly UserMessageContentPart[];
  readonly model: ModelReference;
  readonly queryClient: QueryClient;
  readonly rpcClient: AgentRpcClientApi;
  readonly sessionId: string;
}

interface CompactSessionInput {
  readonly model: ModelReference;
  readonly rpcClient: AgentRpcClientApi;
  readonly sessionId: string;
}

interface CheckpointNavigationInput {
  readonly rpcClient: AgentRpcClientApi;
  readonly sessionId: string;
}

interface RevertToMessageInput extends CheckpointNavigationInput {
  readonly turnId: string;
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
  readonly hydrateSession: (session: Session) => void;
  readonly redoCheckpoint: (input: CheckpointNavigationInput) => void;
  readonly revertToMessage: (input: RevertToMessageInput) => void;
  readonly sendMessage: (input: SendSessionMessageInput) => void;
  readonly undoCheckpoint: (input: CheckpointNavigationInput) => void;
}

export const useSessionLiveStore = create<SessionLiveStoreState>()((set, get) => {
  const hydrateSession = (session: Session): void => {
    set((state) => {
      const entry = state.sessions[session.id] ?? emptyEntry({revision: 0});
      return {sessions: {...state.sessions, [session.id]: {...entry, session}}};
    });
  };

  /** Applies one snapshot to both React Query committed state and Zustand live state. */
  const flushSnapshot = (queryClient: QueryClient, snapshot: Extract<SessionStreamEvent, {type: "session.snapshot"}>): void => {
    const current = get().sessions[snapshot.sessionId];
    if (shouldIgnoreEvent(current, snapshot.revision)) return;

    applySessionSnapshot({queryClient, snapshot});
    updateLifecycle(snapshot.sessionId, snapshot.revision, (entry) => ({
      ...entry,
      agentStreaming: false,
      session: snapshot.session,
      liveTurn: null,
      stopInProgress: false,
    }));
  };

  /** Applies one lifecycle update while preserving monotonic per-session revision order. */
  const updateLifecycle = (
    sessionId: string,
    revision: number,
    update: (entry: Omit<SessionLiveState, "status">) => Omit<SessionLiveState, "status"> & {readonly status?: SessionLiveStatus}
  ): void => {
    set((state) => {
      const current = state.sessions[sessionId];
      if (shouldIgnoreEvent(current, revision)) return state;

      const base = current ?? emptyEntry({revision: 0});
      const {status, ...entry} = {...base, revision};
      void status;
      const next = update(entry);
      return {sessions: {...state.sessions, [sessionId]: {...next, status: next.status ?? toStatus(next)}}};
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
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, agentStreaming: true, error: null, stopInProgress: false}));
        return;
      case "session.agent.ended":
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, agentStreaming: false}));
        return;
      case "session.compaction.started":
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, status: "compacting"}));
        return;
      case "session.compaction.ended":
        return;
      case "session.snapshot":
        flushSnapshot(queryClient, event);
        return;
      case "session.turn":
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, error: null, liveTurn: event.turn}));
        return;
      case "session.updated":
        applySessionSummary({projectPath: event.projectPath, queryClient, sessionId: event.sessionId, summary: event.summary});
        updateLifecycle(event.sessionId, event.revision, (entry) => ({
          ...entry,
          session: entry.session ? {...entry.session, title: event.summary.title, updatedAt: event.summary.updatedAt} : entry.session,
        }));
        return;
      case "session.error":
        updateLifecycle(event.sessionId, event.revision, (entry) => ({
          ...entry,
          agentStreaming: false,
          error: event.error,
          liveTurn: null,
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
    const {contentParts, model, queryClient, rpcClient, sessionId} = input;

    const current = get().sessions[sessionId];
    if (current && current.status !== "idle") return;

    const liveTurn = createInitialStreamTurn({contentParts, model});
    const previousSession = queryClient.getQueryData<Session>(sessionQueryKey(sessionId));
    const previousEntry = current;
    queryClient.setQueryData<Session>(sessionQueryKey(sessionId), (session) => (session ? {...session, undoneTurns: []} : session));
    // Optimistically show the user message in the live layer until the server emits authoritative events.
    set((state) => {
      const entry = state.sessions[sessionId] ?? emptyEntry({revision: 0});
      const session = entry.session ?? previousSession;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...entry,
            agentStreaming: true,
            error: null,
            liveTurn,
            session: session ? {...session, undoneTurns: []} : null,
            status: "streaming",
          },
        },
      };
    });

    void rpcClient
      .run((rpc) => rpc.sendMessage({contentParts, model, sessionId}))
      .catch((cause: unknown) => {
        // Command failures happen before work is accepted, for example invalid model/session errors.
        const error = cause instanceof Error ? cause.message : "Failed to send message.";
        if (previousSession) queryClient.setQueryData(sessionQueryKey(sessionId), previousSession);
        set((state) => {
          const entry = state.sessions[sessionId];
          if (!entry) return state;
          const next = {
            ...entry,
            agentStreaming: false,
            error,
            liveTurn: null,
            session: previousEntry?.session ?? previousSession ?? entry.session,
            stopInProgress: false,
          };
          return {sessions: {...state.sessions, [sessionId]: {...next, status: toStatus(next)}}};
        });
      });
  };

  const abortSession = (input: {rpcClient: AgentRpcClientApi; sessionId: string}): void => {
    const {rpcClient, sessionId} = input;
    const stream = get().sessions[sessionId];
    if (!stream || (stream.status !== "streaming" && stream.status !== "stopping")) return;

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
    if (current && current.status !== "idle") return;

    set((state) => {
      const entry = state.sessions[sessionId] ?? emptyEntry({revision: 0});
      return {sessions: {...state.sessions, [sessionId]: {...entry, error: null, status: "compacting"}}};
    });

    void rpcClient
      .run((rpc) => rpc.compactSession({model, sessionId}))
      .catch((cause: unknown) => {
        const error = errorMessage(cause, "Failed to compact session.");
        set((state) => {
          const entry = state.sessions[sessionId];
          if (!entry) return state;
          const next = {...entry, error};
          return {sessions: {...state.sessions, [sessionId]: {...next, status: toStatus(next)}}};
        });
      });
  };

  const runCheckpointNavigation = (
    input: CheckpointNavigationInput & {execute: (rpc: AgentRpcProtocolClient) => ReturnType<AgentRpcProtocolClient["undoCheckpoint"]>; title: string}
  ): void => {
    const {execute, rpcClient, sessionId, title} = input;

    const current = get().sessions[sessionId];
    if (current && current.status !== "idle") return;

    set((state) => {
      const entry = state.sessions[sessionId] ?? emptyEntry({revision: 0});
      return {sessions: {...state.sessions, [sessionId]: {...entry, error: null, status: "checkpoint-navigating"}}};
    });

    void rpcClient
      .run((rpc) => execute(rpc))
      .catch((cause: unknown) => {
        const description = errorMessage(cause, "The session checkpoint could not be changed.");
        showToast(title, description);
        set((state) => {
          const entry = state.sessions[sessionId];
          if (!entry) return state;
          return {sessions: {...state.sessions, [sessionId]: {...entry, status: toStatus(entry)}}};
        });
      });
  };

  const undoCheckpoint = (input: CheckpointNavigationInput): void => {
    runCheckpointNavigation({...input, execute: (rpc) => rpc.undoCheckpoint({sessionId: input.sessionId}), title: "Unable to undo checkpoint"});
  };

  const redoCheckpoint = (input: CheckpointNavigationInput): void => {
    runCheckpointNavigation({...input, execute: (rpc) => rpc.redoCheckpoint({sessionId: input.sessionId}), title: "Unable to redo checkpoint"});
  };

  const revertToMessage = (input: RevertToMessageInput): void => {
    runCheckpointNavigation({...input, execute: (rpc) => rpc.revertToMessage({sessionId: input.sessionId, turnId: input.turnId}), title: "Unable to revert message"});
  };

  return {
    sessions: {},
    compactSession,
    connect,
    disconnect,
    hydrateSession,
    redoCheckpoint,
    revertToMessage,
    sendMessage,
    abortSession,
    undoCheckpoint,
  };
});
