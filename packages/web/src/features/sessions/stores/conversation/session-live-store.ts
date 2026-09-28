import type {QueryClient} from "@tanstack/react-query";
import {CheckpointConflictError, CheckpointInheritedError, CheckpointUncapturedError} from "@supernova/contracts/session-runtime/procedures";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {ModelReference, OutgoingMessage, Session, SessionContextUsage, Turn, UserMessage, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {create} from "zustand";
import {useSettingsStore} from "@/stores/settings-store";
import {showToast} from "@/lib/toast";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import type {RpcClient, RpcProtocolClient} from "@/rpc/transport/protocol";

export type SessionLiveStatus = "checkpoint-navigating" | "compacting" | "idle" | "stopping" | "streaming";

/** Result of a checkpoint navigation command, so callers can confirm and retry a refused restore. */
export type CheckpointNavigationOutcome = "applied" | "failed" | CheckpointNavigationConfirmation;

/** Owns one optimistic navigation until the user cancels or retries the same command with force. */
export interface CheckpointNavigationConfirmation {
  readonly reason: "conflict" | "uncaptured";
  readonly cancel: () => void;
  readonly confirm: () => Promise<CheckpointNavigationOutcome>;
}

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

/** The session's latest activity timestamp, for events that carry authoritative session data. */
function sessionEventActivityAt(event: RevisionedSessionStreamEvent): string | null {
  if (event.type === "session.snapshot") return event.session.updatedAt;
  if (event.type === "session.updated") return event.summary.updatedAt;
  return null;
}

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

/** The session the server will create for a first message, shown until its first snapshot replaces it. */
function createPendingSession(input: {projectPath: string; sessionId: string}): Session {
  return {
    id: input.sessionId,
    context: {usedTokens: 0, contextWindow: 0},
    projectPath: input.projectPath,
    title: "Untitled session",
    turns: [],
    undoneTurns: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Whether the server created the session and accepted its first turn. On failure nothing of the session remains on the client. */
export type StartSessionOutcome = {readonly status: "started"} | {readonly status: "failed"; readonly message: string};

interface SendSessionMessageInput {
  readonly contentParts: readonly UserMessageContentPart[];
  readonly modelReference: ModelReference;
  readonly queryClient: QueryClient;
  readonly rpcClient: RpcClient;
  readonly sessionId: string;
}

/** The first message of a session that does not exist yet; the server creates it under `sessionId` with this message. */
interface StartSessionInput extends SendSessionMessageInput {
  readonly projectPath: string;
}

interface CompactSessionInput {
  readonly modelReference: ModelReference;
  readonly rpcClient: RpcClient;
  readonly sessionId: string;
}

interface CheckpointNavigationInput {
  /** Set when retrying after the user confirmed discarding manual workspace changes. */
  readonly force?: boolean;
  readonly queryClient: QueryClient;
  readonly rpcClient: RpcClient;
  readonly sessionId: string;
}

interface RevertToMessageInput extends CheckpointNavigationInput {
  readonly turnId: string;
}

interface SessionLiveStoreState {
  /** Session currently open in the main view; its activity is stamped as seen. */
  readonly activeSessionId: string | null;
  readonly sessions: Record<string, SessionLiveState | undefined>;
  readonly abortSession: (input: {rpcClient: RpcClient; sessionId: string}) => void;
  readonly applyEvent: (event: SessionStreamEvent) => boolean;
  readonly compactSession: (input: CompactSessionInput) => void;
  readonly redoCheckpoint: (input: CheckpointNavigationInput) => Promise<CheckpointNavigationOutcome>;
  readonly resetRevisions: () => void;
  readonly revertToMessage: (input: RevertToMessageInput) => Promise<CheckpointNavigationOutcome>;
  readonly sendMessage: (input: SendSessionMessageInput) => void;
  readonly setActiveSession: (sessionId: string | null) => void;
  readonly startSession: (input: StartSessionInput) => Promise<StartSessionOutcome>;
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

    // Activity in the open session is seen as it happens. Stamping the
    // activity time rather than now keeps a later completion unseen.
    const activityAt = applied ? sessionEventActivityAt(event) : null;
    if (activityAt !== null && event.sessionId === get().activeSessionId) {
      useSessionVisitsStore.getState().markSessionVisited(event.sessionId, activityAt);
    }
    return applied;
  };

  const setActiveSession = (sessionId: string | null): void => {
    set((state) => (state.activeSessionId === sessionId ? state : {activeSessionId: sessionId}));
  };

  const resetRevisions = (): void => {
    set((state) => ({
      sessions: Object.fromEntries(Object.entries(state.sessions).map(([sessionId, entry]) => [sessionId, entry ? {...entry, revision: 0} : entry])),
    }));
  };

  /** Shows the user's message as a streaming turn before the server has accepted it. */
  const beginOptimisticTurn = (input: SendSessionMessageInput): OutgoingMessage => {
    const {contentParts, modelReference, sessionId} = input;
    const liveTurn = createInitialStreamTurn({contentParts, modelReference});
    set((state) => {
      const entry = state.sessions[sessionId] ?? emptyEntry();
      return {sessions: {...state.sessions, [sessionId]: {...entry, error: null, liveContext: null, liveTurn, status: "streaming"}}};
    });
    return {captureCheckpoints: useSettingsStore.getState().captureCheckpoints, contentParts, modelReference};
  };

  const sendMessage = (input: SendSessionMessageInput): void => {
    const {queryClient, rpcClient, sessionId} = input;
    const current = get().sessions[sessionId];
    if (current && current.status !== "idle") return;

    const previousSession = queryClient.getQueryData<Session>(sessionKeys.detail(sessionId));
    const previousRevision = current?.revision ?? 0;
    queryClient.setQueryData<Session>(sessionKeys.detail(sessionId), (session) => (session ? {...session, undoneTurns: []} : session));
    const message = beginOptimisticTurn(input);

    void rpcClient
      .run((rpc) => rpc.sendMessage({...message, sessionId}))
      .catch((cause: unknown) => {
        const entry = get().sessions[sessionId];
        if (!entry || entry.revision !== previousRevision) return;

        if (previousSession) queryClient.setQueryData(sessionKeys.detail(sessionId), previousSession);
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

  const startSession = async (input: StartSessionInput): Promise<StartSessionOutcome> => {
    const {projectPath, queryClient, rpcClient, sessionId} = input;
    queryClient.setQueryData<Session>(sessionKeys.detail(sessionId), createPendingSession({projectPath, sessionId}));
    const message = beginOptimisticTurn(input);

    try {
      await rpcClient.run((rpc) => rpc.createSession({id: sessionId, message, projectPath}));
      return {status: "started"};
    } catch (cause) {
      // The server removed the session, so nothing of it may remain on the client.
      queryClient.removeQueries({exact: true, queryKey: sessionKeys.detail(sessionId)});
      set((state) => {
        const sessions = {...state.sessions};
        delete sessions[sessionId];
        return {sessions};
      });
      return {message: errorMessage(cause, "Failed to start the session."), status: "failed"};
    }
  };

  const abortSession = (input: {rpcClient: RpcClient; sessionId: string}): void => {
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
      execute: (rpc: RpcProtocolClient, force: boolean | undefined) => ReturnType<RpcProtocolClient["undoCheckpoint"]>;
      optimisticTurnId: (session: Session) => string | undefined;
      title: string;
    }
  ): Promise<CheckpointNavigationOutcome> => {
    const {execute, optimisticTurnId, queryClient, rpcClient, sessionId, title} = input;
    const current = get().sessions[sessionId];
    if (current && current.status !== "idle") return Promise.resolve("failed");

    const previousSession = queryClient.getQueryData<Session>(sessionKeys.detail(sessionId));
    const turnId = previousSession ? optimisticTurnId(previousSession) : undefined;
    const optimisticSession = previousSession && turnId ? optimisticRevertToMessage(previousSession, turnId) : previousSession;
    if (optimisticSession) queryClient.setQueryData(sessionKeys.detail(sessionId), optimisticSession);

    set((state) => {
      const entry = state.sessions[sessionId] ?? emptyEntry();
      return {sessions: {...state.sessions, [sessionId]: {...entry, error: null, status: "checkpoint-navigating"}}};
    });

    const previousRevision = current?.revision ?? 0;
    const rollback = (): void => {
      const entry = get().sessions[sessionId];
      // A newer server event supersedes this optimistic operation.
      if (!entry || entry.revision !== previousRevision || entry.status !== "checkpoint-navigating") return;
      if (previousSession) queryClient.setQueryData(sessionKeys.detail(sessionId), previousSession);
      set((state) => ({sessions: {...state.sessions, [sessionId]: {...entry, status: "idle"}}}));
    };

    const executeNavigation = (force: boolean | undefined): Promise<CheckpointNavigationOutcome> =>
      rpcClient
        .run((rpc) => execute(rpc, force))
        .then((): CheckpointNavigationOutcome => "applied")
        .catch((cause: unknown): CheckpointNavigationOutcome => {
          const reason = cause instanceof CheckpointConflictError ? "conflict" : cause instanceof CheckpointUncapturedError ? "uncaptured" : undefined;
          if (reason && !force) {
            let pending = true;
            return {
              reason,
              cancel: () => {
                if (!pending) return;
                pending = false;
                rollback();
              },
              confirm: () => {
                if (!pending) return Promise.resolve("failed");
                pending = false;
                const entry = get().sessions[sessionId];
                if (!entry || entry.revision !== previousRevision || entry.status !== "checkpoint-navigating") return Promise.resolve("failed");
                return executeNavigation(true);
              },
            };
          }
          if (cause instanceof CheckpointInheritedError) {
            showToast("Nothing to undo in this fork", "This message came from the session this one was forked from. Only messages sent in this session can be undone.");
            rollback();
            return "failed";
          }
          showToast(title, errorMessage(cause, "The session checkpoint could not be changed."));
          rollback();
          return "failed";
        });

    return executeNavigation(input.force);
  };

  const undoCheckpoint = (input: CheckpointNavigationInput): Promise<CheckpointNavigationOutcome> =>
    runCheckpointNavigation({
      ...input,
      execute: (rpc, force) => rpc.undoCheckpoint({force, sessionId: input.sessionId}),
      optimisticTurnId: (session) => session.turns.at(-1)?.id,
      title: "Unable to undo checkpoint",
    });

  const redoCheckpoint = (input: CheckpointNavigationInput): Promise<CheckpointNavigationOutcome> =>
    runCheckpointNavigation({
      ...input,
      execute: (rpc, force) => rpc.redoCheckpoint({force, sessionId: input.sessionId}),
      optimisticTurnId: (session) => session.undoneTurns[0]?.id,
      title: "Unable to redo checkpoint",
    });

  const revertToMessage = (input: RevertToMessageInput): Promise<CheckpointNavigationOutcome> =>
    runCheckpointNavigation({
      ...input,
      execute: (rpc, force) => rpc.revertToMessage({force, sessionId: input.sessionId, turnId: input.turnId}),
      optimisticTurnId: () => input.turnId,
      title: "Unable to revert message",
    });

  return {
    abortSession,
    activeSessionId: null,
    applyEvent,
    compactSession,
    redoCheckpoint,
    resetRevisions,
    revertToMessage,
    sendMessage,
    sessions: {},
    setActiveSession,
    startSession,
    undoCheckpoint,
  };
});
