import type {QueryClient} from "@tanstack/react-query";
import {CheckpointConflictError} from "@supernova/contracts/session-runtime/procedures";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {ModelReference, Session, SessionContextUsage, Turn, UserMessage, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {create} from "zustand";
import {showToast} from "@/components/ui/toast-manager";
import {sessionQueryKey} from "@/features/sessions/hooks/api/use-session";
import type {AgentRpcClientApi, AgentRpcProtocolClient} from "@/rpc/agent-rpc-client";

export type SessionLiveStatus = "checkpoint-navigating" | "compacting" | "idle" | "stopping" | "streaming";

/** Result of a checkpoint navigation command, so callers can confirm and retry a refused restore. */
export type CheckpointNavigationOutcome = "applied" | "conflict" | "failed";

export interface SessionLiveState {
  readonly error: string | null;
  /** Latest streamed context usage, kept separate from committed React Query data. */
  readonly liveContext: SessionContextUsage | null;
  /** Currently streaming turn, kept separate from committed React Query data. */
  readonly liveTurn: Turn | null;
  /** Latest server revision applied for this session. Older session-scoped events are ignored. */
  readonly revision: number;
  readonly status: SessionLiveStatus;
}

/** Creates an optimistic local turn so the user message appears before the first runtime event. */
function createInitialStreamTurn(input: {contentParts: readonly UserMessageContentPart[]; modelReference: ModelReference}): Turn {
  const timestamp = new Date().toISOString();
  const localMessage: UserMessage = {contentParts: input.contentParts, id: `msg_${crypto.randomUUID()}`, timestamp};
  return {
    events: [],
    id: localMessage.id,
    modelReference: input.modelReference,
    startedAt: timestamp,
    status: "streaming",
    userMessage: localMessage,
  };
}

/** Creates baseline event-derived state for sessions first seen from the global stream. */
function emptyEntry(revision = 0): SessionLiveState {
  return {error: null, liveContext: null, liveTurn: null, revision, status: "idle"};
}

/** Normalizes command failures for user-facing messages. */
function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.length > 0 ? cause.message : fallback;
}

/** Applies the cheap local chat-only part of checkpoint navigation. Server snapshots remain authoritative. */
function optimisticRevertToMessage(session: Session, turnId: string): Session {
  const undoneIndex = session.undoneTurns.findIndex((turn) => turn.id === turnId);
  if (undoneIndex >= 0) {
    return {...session, turns: [...session.turns, ...session.undoneTurns.slice(0, undoneIndex + 1)], undoneTurns: session.undoneTurns.slice(undoneIndex + 1)};
  }

  const turnIndex = session.turns.findIndex((turn) => turn.id === turnId);
  return turnIndex >= 0 ? {...session, turns: session.turns.slice(0, turnIndex), undoneTurns: [...session.turns.slice(turnIndex), ...session.undoneTurns]} : session;
}

type RevisionedSessionStreamEvent = Extract<SessionStreamEvent, {readonly revision: number}>;

/** Reduces one accepted server event into ephemeral session state. */
function reduceSessionEvent(entry: SessionLiveState, event: RevisionedSessionStreamEvent): SessionLiveState {
  switch (event.type) {
    case "session.agent.started":
      return {...entry, error: null, status: "streaming"};
    case "session.agent.ended":
    case "session.updated":
      return entry;
    case "session.compaction.started":
      return {...entry, status: "compacting"};
    case "session.compaction.ended":
      return {...entry, status: entry.status === "stopping" ? "stopping" : entry.liveTurn ? "streaming" : "idle"};
    case "session.snapshot":
      return {...entry, error: null, liveContext: null, liveTurn: null, status: "idle"};
    case "session.turn":
      return {
        ...entry,
        error: null,
        liveContext: event.context,
        liveTurn: event.turn,
        status: entry.status === "compacting" || entry.status === "stopping" ? entry.status : "streaming",
      };
    case "session.error":
      return {...entry, error: event.error, liveContext: null, liveTurn: null, status: "idle"};
  }
}

interface SendSessionMessageInput {
  readonly contentParts: readonly UserMessageContentPart[];
  readonly modelReference: ModelReference;
  readonly queryClient: QueryClient;
  readonly rpcClient: AgentRpcClientApi;
  readonly sessionId: string;
}

interface CompactSessionInput {
  readonly modelReference: ModelReference;
  readonly rpcClient: AgentRpcClientApi;
  readonly sessionId: string;
}

interface CheckpointNavigationInput {
  /** Set when retrying after the user confirmed discarding manual workspace changes. */
  readonly force?: boolean;
  readonly queryClient: QueryClient;
  readonly rpcClient: AgentRpcClientApi;
  readonly sessionId: string;
}

interface RevertToMessageInput extends CheckpointNavigationInput {
  readonly turnId: string;
}

interface SessionLiveStoreState {
  readonly sessions: Record<string, SessionLiveState | undefined>;
  readonly abortSession: (input: {rpcClient: AgentRpcClientApi; sessionId: string}) => void;
  readonly applyEvent: (event: SessionStreamEvent) => boolean;
  readonly compactSession: (input: CompactSessionInput) => void;
  readonly redoCheckpoint: (input: CheckpointNavigationInput) => Promise<CheckpointNavigationOutcome>;
  readonly resetRevisions: () => void;
  readonly revertToMessage: (input: RevertToMessageInput) => Promise<CheckpointNavigationOutcome>;
  readonly sendMessage: (input: SendSessionMessageInput) => void;
  readonly undoCheckpoint: (input: CheckpointNavigationInput) => Promise<CheckpointNavigationOutcome>;
}

export const useSessionLiveStore = create<SessionLiveStoreState>()((set, get) => {
  const applyEvent = (event: SessionStreamEvent): boolean => {
    if (!("revision" in event)) return false;

    let applied = false;
    set((state) => {
      const current = state.sessions[event.sessionId];
      if (current && event.revision <= current.revision) return state;

      applied = true;
      const entry = {...(current ?? emptyEntry()), revision: event.revision};
      return {sessions: {...state.sessions, [event.sessionId]: reduceSessionEvent(entry, event)}};
    });
    return applied;
  };

  const resetRevisions = (): void => {
    set((state) => ({
      sessions: Object.fromEntries(Object.entries(state.sessions).map(([sessionId, entry]) => [sessionId, entry ? {...entry, revision: 0} : entry])),
    }));
  };

  const sendMessage = (input: SendSessionMessageInput): void => {
    const {contentParts, modelReference, queryClient, rpcClient, sessionId} = input;
    const current = get().sessions[sessionId];
    if (current && current.status !== "idle") return;

    const liveTurn = createInitialStreamTurn({contentParts, modelReference});
    const previousSession = queryClient.getQueryData<Session>(sessionQueryKey(sessionId));
    const previousRevision = current?.revision ?? 0;
    queryClient.setQueryData<Session>(sessionQueryKey(sessionId), (session) => (session ? {...session, undoneTurns: []} : session));
    set((state) => {
      const entry = state.sessions[sessionId] ?? emptyEntry();
      return {sessions: {...state.sessions, [sessionId]: {...entry, error: null, liveContext: null, liveTurn, status: "streaming"}}};
    });

    void rpcClient
      .run((rpc) => rpc.sendMessage({contentParts, modelReference, sessionId}))
      .catch((cause: unknown) => {
        const entry = get().sessions[sessionId];
        if (!entry || entry.revision !== previousRevision) return;

        if (previousSession) queryClient.setQueryData(sessionQueryKey(sessionId), previousSession);
        set((state) => {
          const currentEntry = state.sessions[sessionId];
          if (!currentEntry || currentEntry.revision !== previousRevision) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {...currentEntry, error: errorMessage(cause, "Failed to send message."), liveContext: null, liveTurn: null, status: "idle"},
            },
          };
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
      return {sessions: {...state.sessions, [sessionId]: {...entry, liveTurn, status: "stopping"}}};
    });

    void rpcClient
      .run((rpc) => rpc.abortSession({sessionId}))
      .catch(() => {
        set((state) => {
          const entry = state.sessions[sessionId];
          if (!entry || entry.status !== "stopping") return state;
          return {sessions: {...state.sessions, [sessionId]: {...entry, status: entry.liveTurn ? "streaming" : "idle"}}};
        });
      });
  };

  const compactSession = (input: CompactSessionInput): void => {
    const {modelReference, rpcClient, sessionId} = input;
    const current = get().sessions[sessionId];
    if (current && current.status !== "idle") return;

    set((state) => {
      const entry = state.sessions[sessionId] ?? emptyEntry();
      return {sessions: {...state.sessions, [sessionId]: {...entry, error: null, status: "compacting"}}};
    });

    void rpcClient
      .run((rpc) => rpc.compactSession({modelReference, sessionId}))
      .catch((cause: unknown) => {
        set((state) => {
          const entry = state.sessions[sessionId];
          if (!entry) return state;
          return {sessions: {...state.sessions, [sessionId]: {...entry, error: errorMessage(cause, "Failed to compact session."), status: "idle"}}};
        });
      });
  };

  const runCheckpointNavigation = (
    input: CheckpointNavigationInput & {
      execute: (rpc: AgentRpcProtocolClient) => ReturnType<AgentRpcProtocolClient["undoCheckpoint"]>;
      optimisticTurnId: (session: Session) => string | undefined;
      title: string;
    }
  ): Promise<CheckpointNavigationOutcome> => {
    const {execute, optimisticTurnId, queryClient, rpcClient, sessionId, title} = input;
    const current = get().sessions[sessionId];
    if (current && current.status !== "idle") return Promise.resolve("failed");

    const previousSession = queryClient.getQueryData<Session>(sessionQueryKey(sessionId));
    const turnId = previousSession ? optimisticTurnId(previousSession) : undefined;
    const optimisticSession = previousSession && turnId ? optimisticRevertToMessage(previousSession, turnId) : previousSession;
    if (optimisticSession) queryClient.setQueryData(sessionQueryKey(sessionId), optimisticSession);

    set((state) => {
      const entry = state.sessions[sessionId] ?? emptyEntry();
      return {sessions: {...state.sessions, [sessionId]: {...entry, error: null, status: "checkpoint-navigating"}}};
    });

    return rpcClient
      .run((rpc) => execute(rpc))
      .then((): CheckpointNavigationOutcome => "applied")
      .catch((cause: unknown): CheckpointNavigationOutcome => {
        const conflict = cause instanceof CheckpointConflictError;
        if (!conflict) showToast(title, errorMessage(cause, "The session checkpoint could not be changed."));
        if (previousSession) queryClient.setQueryData(sessionQueryKey(sessionId), previousSession);
        set((state) => {
          const entry = state.sessions[sessionId];
          if (!entry) return state;
          return {sessions: {...state.sessions, [sessionId]: {...entry, status: "idle"}}};
        });
        return conflict ? "conflict" : "failed";
      });
  };

  const undoCheckpoint = (input: CheckpointNavigationInput): Promise<CheckpointNavigationOutcome> =>
    runCheckpointNavigation({
      ...input,
      execute: (rpc) => rpc.undoCheckpoint({force: input.force, sessionId: input.sessionId}),
      optimisticTurnId: (session) => session.turns.at(-1)?.id,
      title: "Unable to undo checkpoint",
    });

  const redoCheckpoint = (input: CheckpointNavigationInput): Promise<CheckpointNavigationOutcome> =>
    runCheckpointNavigation({
      ...input,
      execute: (rpc) => rpc.redoCheckpoint({force: input.force, sessionId: input.sessionId}),
      optimisticTurnId: (session) => session.undoneTurns[0]?.id,
      title: "Unable to redo checkpoint",
    });

  const revertToMessage = (input: RevertToMessageInput): Promise<CheckpointNavigationOutcome> =>
    runCheckpointNavigation({
      ...input,
      execute: (rpc) => rpc.revertToMessage({force: input.force, sessionId: input.sessionId, turnId: input.turnId}),
      optimisticTurnId: () => input.turnId,
      title: "Unable to revert message",
    });

  return {abortSession, applyEvent, compactSession, redoCheckpoint, resetRevisions, revertToMessage, sendMessage, sessions: {}, undoCheckpoint};
});
