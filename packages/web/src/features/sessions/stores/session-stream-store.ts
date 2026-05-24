import type {QueryClient} from "@tanstack/react-query";
import type {SendMessagePayload, SessionStreamEvent} from "@supernova/contracts/sessions/procedures";
import type {ModelReference, Session, SessionSummary, Turn, UserMessageContentPart, UserMessage} from "@supernova/contracts/sessions/schemas";
import type {ProjectSessionsListResult} from "@supernova/contracts/projects/procedures";
import {create} from "zustand";
import {Effect, Stream} from "effect";
import {allProjectSessionsQueryKey, listProjectSessionsQueryKey} from "@/features/projects/hooks/api/use-list-project-sessions";
import {sessionQueryKey} from "@/features/sessions/hooks/api/use-session";
import {upsertInterruptedTurn} from "@/features/sessions/lib/streaming/interrupted-turns";
import type {AgentRpcClientApi, AgentRpcClientFiber} from "@/rpc/agent-rpc-client";

export type SessionStreamStatus = "idle" | "streaming" | "stopping";

export interface SessionStreamState {
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
  readonly status: SessionStreamStatus;
  /** Explicit stop request is in flight; keeps the UI disabled until server events/snapshots catch up. */
  readonly stopInProgress: boolean;
  /** Last committed transcript snapshot used as the base while live UI is active. */
  readonly turns: readonly Turn[];
}

type SessionStreamEntry = SessionStreamState;

interface StartSessionStreamInput {
  readonly contentParts: readonly UserMessageContentPart[];
  readonly model: ModelReference;
  readonly queryClient: QueryClient;
  readonly rpcClient: AgentRpcClientApi;
  readonly sessionId: string;
  readonly sessionTurns: readonly Turn[];
}

interface ConnectSessionEventsInput {
  readonly queryClient: QueryClient;
  readonly rpcClient: AgentRpcClientApi;
}

interface SessionStreamStoreState {
  readonly streams: Record<string, SessionStreamEntry | undefined>;
  readonly connectEvents: (input: ConnectSessionEventsInput) => void;
  readonly disconnectEvents: () => void;
  readonly startStream: (input: StartSessionStreamInput) => void;
  readonly stopStream: (input: {queryClient: QueryClient; rpcClient: AgentRpcClientApi; sessionId: string}) => void;
}

let eventsFiber: AgentRpcClientFiber | null = null;
let eventsConnecting = false;
let reconnectTimer: number | null = null;
let pendingSnapshots = new Map<string, Extract<SessionStreamEvent, {type: "session.snapshot"}>>();
let pendingSnapshotFrame: number | null = null;

/** Creates an optimistic local turn so the user message appears before the first runtime snapshot. */
function createInitialStreamTurn(input: {contentParts: readonly UserMessageContentPart[]; model: ModelReference}): Turn {
  const timestamp = new Date().toISOString();
  const localMessage: UserMessage = {contentParts: input.contentParts, id: `msg_${crypto.randomUUID()}`, timestamp};
  return {events: [], id: localMessage.id, model: input.model, startedAt: timestamp, status: "streaming", userMessage: localMessage};
}

/** Creates baseline event-derived state for sessions first seen from the global stream. */
function emptyEntry(input: {revision: number; turns: readonly Turn[]}): SessionStreamEntry {
  return {
    agentStreaming: false,
    compacting: false,
    error: null,
    liveTurn: null,
    pendingContinuation: false,
    revision: input.revision,
    status: "idle",
    stopInProgress: false,
    turns: input.turns,
  };
}

/** Derives the legacy composer status from event-derived lifecycle flags. */
function toStatus(entry: Omit<SessionStreamEntry, "status">): SessionStreamStatus {
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
function shouldIgnoreEvent(entry: SessionStreamEntry | undefined, revision: number): boolean {
  return Boolean(entry && revision <= entry.revision);
}

export const useSessionStreamStore = create<SessionStreamStoreState>()((set, get) => {
  /** Applies one lifecycle update while preserving monotonic per-session revision order. */
  const updateLifecycle = (sessionId: string, revision: number, update: (entry: SessionStreamEntry) => Omit<SessionStreamEntry, "status">): void => {
    set((state) => {
      const current = state.streams[sessionId];
      if (shouldIgnoreEvent(current, revision)) return state;

      const base = current ?? emptyEntry({revision: 0, turns: []});
      const next = update({...base, revision});
      return {streams: {...state.streams, [sessionId]: {...next, status: toStatus(next)}}};
    });
  };

  /** Flushes the latest queued snapshot per session for the current animation frame. */
  const flushSnapshots = (queryClient: QueryClient): void => {
    pendingSnapshotFrame = null;
    const snapshots = pendingSnapshots;
    pendingSnapshots = new Map();

    for (const snapshot of snapshots.values()) {
      flushSnapshot(queryClient, snapshot);
    }
  };

  /** Applies one snapshot to both React Query committed state and Zustand live state. */
  const flushSnapshot = (queryClient: QueryClient, snapshot: Extract<SessionStreamEvent, {type: "session.snapshot"}>): void => {
    if (shouldIgnoreEvent(get().streams[snapshot.sessionId], snapshot.revision)) return;

    applySessionSnapshot({queryClient, snapshot});
    updateLifecycle(snapshot.sessionId, snapshot.revision, (entry) => ({
      ...entry,
      agentStreaming: false,
      compacting: false,
      liveTurn: null,
      pendingContinuation: false,
      stopInProgress: false,
      turns: snapshot.session.turns,
    }));
  };

  /** Preserves stream ordering when a lifecycle event arrives after a coalesced snapshot. */
  const flushPendingSnapshotForSession = (queryClient: QueryClient, sessionId: string): void => {
    const snapshot = pendingSnapshots.get(sessionId);
    if (!snapshot) return;

    pendingSnapshots.delete(sessionId);
    flushSnapshot(queryClient, snapshot);
  };

  /** Coalesces high-frequency snapshots by session while keeping only the newest revision per frame. */
  const queueSnapshot = (queryClient: QueryClient, snapshot: Extract<SessionStreamEvent, {type: "session.snapshot"}>): void => {
    const previous = pendingSnapshots.get(snapshot.sessionId);
    if (!previous || snapshot.revision > previous.revision) pendingSnapshots.set(snapshot.sessionId, snapshot);
    if (pendingSnapshotFrame === null) pendingSnapshotFrame = window.requestAnimationFrame(() => flushSnapshots(queryClient));
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
        flushPendingSnapshotForSession(queryClient, event.sessionId);
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, agentStreaming: true, error: null, pendingContinuation: false, stopInProgress: false}));
        return;
      case "session.agent.ended":
        flushPendingSnapshotForSession(queryClient, event.sessionId);
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, agentStreaming: false}));
        return;
      case "session.compaction.started":
        flushPendingSnapshotForSession(queryClient, event.sessionId);
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, compacting: true}));
        return;
      case "session.compaction.ended":
        flushPendingSnapshotForSession(queryClient, event.sessionId);
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, compacting: false, pendingContinuation: event.willContinue}));
        return;
      case "session.snapshot":
        queueSnapshot(queryClient, event);
        return;
      case "session.turn":
        flushPendingSnapshotForSession(queryClient, event.sessionId);
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry, error: null, liveTurn: event.turn, stopInProgress: false}));
        return;
      case "session.updated":
        flushPendingSnapshotForSession(queryClient, event.sessionId);
        applySessionSummary({queryClient, sessionId: event.sessionId, summary: event.summary});
        updateLifecycle(event.sessionId, event.revision, (entry) => ({...entry}));
        return;
      case "session.error":
        flushPendingSnapshotForSession(queryClient, event.sessionId);
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

  const connectEvents = (input: ConnectSessionEventsInput): void => {
    if (eventsFiber || eventsConnecting) return;

    const start = (): void => {
      if (eventsFiber || eventsConnecting) return;
      eventsConnecting = true;
      // The global subscription observes all sessions. Interrupting this browser fiber only unsubscribes the client;
      // active Pi work remains owned by the server runtime.
      void input.rpcClient
        .fork((rpc) => rpc.watchEvents().pipe(Stream.runForEach((event) => Effect.sync(() => handleEvent({event, queryClient: input.queryClient})))))
        .then((fiber) => {
          eventsConnecting = false;
          eventsFiber = fiber;
          void fiber.completed.then(() => {
            if (eventsFiber !== fiber) return;
            eventsFiber = null;
            reconnectTimer = window.setTimeout(start, 1_000);
          });
        })
        .catch(() => {
          eventsConnecting = false;
          eventsFiber = null;
          reconnectTimer = window.setTimeout(start, 1_000);
        });
    };

    start();
  };

  return {
    connectEvents,
    disconnectEvents: () => {
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      eventsConnecting = false;
      void eventsFiber?.interrupt();
      eventsFiber = null;
      if (pendingSnapshotFrame !== null) window.cancelAnimationFrame(pendingSnapshotFrame);
      pendingSnapshotFrame = null;
      pendingSnapshots = new Map();
    },
    streams: {},
    startStream: (input) => {
      const {contentParts, model, queryClient, rpcClient, sessionId, sessionTurns} = input;
      const current = get().streams[sessionId];
      if (current?.status === "streaming" || current?.status === "stopping") return;

      const liveTurn = createInitialStreamTurn({contentParts, model});
      // Optimistically append the user's message. Server snapshots will replace the base turns and live turn as observed events arrive.
      set((state) => ({
        streams: {...state.streams, [sessionId]: {...emptyEntry({revision: 0, turns: sessionTurns}), agentStreaming: true, liveTurn, status: "streaming"}},
      }));

      void rpcClient
        .run((rpc) => rpc.sendMessage({contentParts, model, sessionId} satisfies SendMessagePayload))
        .catch((cause: unknown) => {
          // Command failures happen before work is accepted, for example invalid model/session errors.
          const error = cause instanceof Error ? cause.message : "Failed to send message.";
          set((state) => {
            const entry = state.streams[sessionId];
            if (!entry) return state;
            const next = {...entry, agentStreaming: false, error, liveTurn: null, stopInProgress: false};
            return {streams: {...state.streams, [sessionId]: {...next, status: toStatus(next)}}};
          });
        });

      void queryClient.invalidateQueries({queryKey: sessionQueryKey(sessionId)});
    },
    stopStream: (input) => {
      const {queryClient, rpcClient, sessionId} = input;
      const stream = get().streams[sessionId];
      if (!stream || stream.status === "idle") return;

      const turns = stream.liveTurn ? upsertInterruptedTurn(stream.turns, stream.liveTurn) : stream.turns;
      queryClient.setQueryData<Session>(sessionQueryKey(sessionId), (session) => (session ? {...session, turns} : session));
      set((state) => {
        const entry = state.streams[sessionId];
        if (!entry) return state;
        return {streams: {...state.streams, [sessionId]: {...entry, liveTurn: null, status: "stopping", stopInProgress: true, turns}}};
      });
      // Stop is the only client action that explicitly aborts server-owned Pi work.
      void rpcClient.run((rpc) => rpc.abortSession({sessionId})).catch(() => undefined);
    },
  };
});
