import type {QueryClient} from "@tanstack/react-query";
import {CheckpointConflictError, CheckpointInheritedError, CheckpointUncapturedError} from "@supernova/contracts/session-runtime/procedures";
import type {SessionActivity, SessionSetupStep, SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {ModelReference, OutgoingMessage, Session, SessionWorkspaceSelection, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
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

/** A message sent but not yet in the session's state; shown as the start of the live turn until it is. */
export interface PendingMessage {
  readonly id: string;
  readonly contentParts: readonly UserMessageContentPart[];
  readonly timestamp: string;
  /** How many turn records the session had when it was sent; the message is in the state once there are more. */
  readonly turnCount: number;
}

/**
 * Client state around a session's server document. The document itself (Pi's entries and live state) is React
 * Query's and changes only by the server's deltas; what the user just did and the server has not shown yet lives here.
 */
export interface SessionLiveState {
  readonly error: string | null;
  /** What the server says the session is doing; known for every session the stream mentions. */
  readonly activity: SessionActivity;
  /** Command started here and not settled yet. */
  readonly command: "checkpoint-navigating" | "compacting" | "stopping" | null;
  readonly pending: PendingMessage | null;
  /** Turn an optimistic undo, redo, or revert moves to, until the command settles. */
  readonly navigationTurnId: string | null;
  /** Latest server revision applied for this session. Older session-scoped events are ignored. */
  readonly revision: number;
  /** Setup step running before a new session's first turn, shown in place of the thinking label. Set optimistically for steps the client asked for. */
  readonly setupStep: SessionSetupStep | null;
  readonly status: SessionLiveStatus;
}

/** Creates baseline state for sessions first seen from the global stream. */
function emptyEntry(revision = 0): SessionLiveState {
  return {activity: "idle", command: null, error: null, navigationTurnId: null, pending: null, revision, setupStep: null, status: "idle"};
}

/** Recomputes the status: a command in flight wins, then what the server runs, then a message not yet placed. */
function withStatus(entry: Omit<SessionLiveState, "status"> & {readonly status?: SessionLiveStatus}): SessionLiveState {
  const {activity, command, pending} = entry;
  const settledStop = command === "stopping" && activity === "idle" && !pending;
  const next = settledStop ? {...entry, command: null} : entry;
  let status: SessionLiveStatus = "idle";
  if (next.command === "checkpoint-navigating" || next.command === "stopping") status = next.command;
  else if (next.command === "compacting" || activity === "compacting") status = "compacting";
  else if (pending || activity === "running") status = "streaming";
  return {...next, status};
}

/** Normalizes command failures for user-facing messages. */
function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.length > 0 ? cause.message : fallback;
}

function turnCount(session: Session | undefined): number {
  return session ? Object.keys(session.turns).length : 0;
}

type RevisionedSessionStreamEvent = Extract<SessionStreamEvent, {readonly revision: number}>;

/** The session's latest activity timestamp, for events that carry authoritative session data. */
function sessionEventActivityAt(event: RevisionedSessionStreamEvent): string | null {
  return event.type === "session.updated" ? event.summary.updatedAt : null;
}

/** Reduces one accepted server event into client session state. */
function reduceSessionEvent(entry: SessionLiveState, event: RevisionedSessionStreamEvent): SessionLiveState {
  switch (event.type) {
    case "session.updated":
      return entry;
    case "session.setup.started":
      return {...entry, setupStep: event.step};
    case "session.setup.ended":
      return {...entry, setupStep: null};
    case "session.state":
      return withStatus({
        ...entry,
        activity: event.activity,
        error: event.activity === "running" ? null : entry.error,
        setupStep: event.activity === "idle" ? entry.setupStep : null,
      });
    case "session.error":
      return withStatus({...entry, command: entry.command === "stopping" ? null : entry.command, error: event.error, pending: null, setupStep: null});
  }
}

/** The session the server will create for a first message, shown until the server's document replaces it. */
function createPendingSession(input: {projectPath: string; sessionId: string}): Session {
  return {
    id: input.sessionId,
    // No server version: deltas never apply to it, the created session's document replaces it.
    version: -1,
    title: "Untitled session",
    forked: false,
    projectPath: input.projectPath,
    updatedAt: new Date().toISOString(),
    entries: [],
    undone: [],
    agent: {},
    live: {},
    usage: {models: {}, tools: {}},
    turns: {},
    context: {usedTokens: 0, contextWindow: 0},
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
  readonly workspace: SessionWorkspaceSelection;
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

interface NavigationTargets {
  /** The last visible turn: what undo hides. */
  readonly lastTurnId: string | undefined;
  /** The first undone turn: what redo shows again. */
  readonly firstUndoneTurnId: string | undefined;
}

interface SessionLiveStoreState {
  /** Session currently open in the main view; its activity is stamped as seen. */
  readonly activeSessionId: string | null;
  readonly sessions: Record<string, SessionLiveState | undefined>;
  readonly abortSession: (input: {rpcClient: RpcClient; sessionId: string}) => void;
  readonly applyEvent: (event: SessionStreamEvent) => boolean;
  readonly compactSession: (input: CompactSessionInput) => void;
  readonly redoCheckpoint: (input: CheckpointNavigationInput & NavigationTargets) => Promise<CheckpointNavigationOutcome>;
  readonly resetRevisions: () => void;
  readonly revertToMessage: (input: RevertToMessageInput) => Promise<CheckpointNavigationOutcome>;
  readonly sendMessage: (input: SendSessionMessageInput) => void;
  readonly setActiveSession: (sessionId: string | null) => void;
  /** Drops the pending message once the session's state has more turns than when it was sent. */
  readonly settlePending: (sessionId: string, turnCount: number) => void;
  readonly startSession: (input: StartSessionInput) => Promise<StartSessionOutcome>;
  readonly undoCheckpoint: (input: CheckpointNavigationInput & NavigationTargets) => Promise<CheckpointNavigationOutcome>;
}

export const useSessionLiveStore = create<SessionLiveStoreState>()((set, get) => {
  const update = (sessionId: string, change: (entry: SessionLiveState) => Omit<SessionLiveState, "status"> | SessionLiveState): void => {
    set((state) => ({sessions: {...state.sessions, [sessionId]: withStatus(change(state.sessions[sessionId] ?? emptyEntry()))}}));
  };

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

  const settlePending = (sessionId: string, count: number): void => {
    const pending = get().sessions[sessionId]?.pending;
    if (pending && count > pending.turnCount) update(sessionId, (entry) => ({...entry, pending: null}));
  };

  const setActiveSession = (sessionId: string | null): void => {
    set((state) => (state.activeSessionId === sessionId ? state : {activeSessionId: sessionId}));
  };

  const resetRevisions = (): void => {
    set((state) => ({
      sessions: Object.fromEntries(Object.entries(state.sessions).map(([sessionId, entry]) => [sessionId, entry ? {...entry, revision: 0} : entry])),
    }));
  };

  /** Shows the user's message as the live turn before the server has accepted it. */
  const beginPendingMessage = (input: SendSessionMessageInput): OutgoingMessage => {
    const {contentParts, modelReference, queryClient, sessionId} = input;
    const pending: PendingMessage = {
      contentParts,
      id: `msg_${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      turnCount: turnCount(queryClient.getQueryData<Session>(sessionKeys.detail(sessionId))),
    };
    update(sessionId, (entry) => ({...entry, error: null, pending}));
    return {captureCheckpoints: useSettingsStore.getState().captureCheckpoints, contentParts, modelReference};
  };

  const failPendingMessage = (sessionId: string, error: string | null): void => {
    update(sessionId, (entry) => ({...entry, command: entry.command === "stopping" ? null : entry.command, error, pending: null}));
  };

  const sendMessage = (input: SendSessionMessageInput): void => {
    const {queryClient, rpcClient, sessionId} = input;
    const current = get().sessions[sessionId];
    if (current && current.status !== "idle") return;

    const message = beginPendingMessage(input);
    void rpcClient
      .run((rpc) => rpc.sendMessage({...message, sessionId}))
      .then(() => settlePending(sessionId, turnCount(queryClient.getQueryData<Session>(sessionKeys.detail(sessionId)))))
      .catch((cause: unknown) => failPendingMessage(sessionId, errorMessage(cause, "Failed to send message.")));
  };

  const startSession = async (input: StartSessionInput): Promise<StartSessionOutcome> => {
    const {projectPath, queryClient, rpcClient, sessionId, workspace} = input;
    queryClient.setQueryData<Session>(sessionKeys.detail(sessionId), createPendingSession({projectPath, sessionId}));
    const message = beginPendingMessage(input);
    // The worktree step starts before any event can arrive; showing it now keeps the thinking label from flashing first.
    if (workspace.mode === "worktree") update(sessionId, (entry) => ({...entry, setupStep: "worktree"}));

    try {
      const session = await rpcClient.run((rpc) => rpc.createSession({id: sessionId, message, projectPath, workspace}));
      // Deltas published before this reply could not apply to the placeholder; the reply or a refetch catches up.
      queryClient.setQueryData<Session>(sessionKeys.detail(sessionId), (cached) => (cached && cached.version >= session.version ? cached : session));
      void queryClient.invalidateQueries({exact: true, queryKey: sessionKeys.detail(sessionId)});
      settlePending(sessionId, turnCount(session));
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

    update(sessionId, (entry) => ({...entry, command: "stopping"}));
    void rpcClient
      .run((rpc) => rpc.abortSession({sessionId}))
      .catch(() => update(sessionId, (entry) => ({...entry, command: entry.command === "stopping" ? null : entry.command})));
  };

  const compactSession = (input: CompactSessionInput): void => {
    const {modelReference, rpcClient, sessionId} = input;
    const current = get().sessions[sessionId];
    if (current && current.status !== "idle") return;

    update(sessionId, (entry) => ({...entry, command: "compacting", error: null}));
    void rpcClient
      .run((rpc) => rpc.compactSession({modelReference, sessionId}))
      .then(
        () => update(sessionId, (entry) => ({...entry, command: entry.command === "compacting" ? null : entry.command})),
        (cause: unknown) =>
          update(sessionId, (entry) => ({...entry, command: entry.command === "compacting" ? null : entry.command, error: errorMessage(cause, "Failed to compact session.")}))
      );
  };

  const runCheckpointNavigation = (
    input: CheckpointNavigationInput & {
      execute: (rpc: RpcProtocolClient, force: boolean | undefined) => ReturnType<RpcProtocolClient["undoCheckpoint"]>;
      turnId: string | undefined;
      title: string;
    }
  ): Promise<CheckpointNavigationOutcome> => {
    const {execute, rpcClient, sessionId, title, turnId} = input;
    const current = get().sessions[sessionId];
    if (current && current.status !== "idle") return Promise.resolve("failed");

    update(sessionId, (entry) => ({...entry, command: "checkpoint-navigating", error: null, navigationTurnId: turnId ?? null}));

    const isNavigating = (): boolean => get().sessions[sessionId]?.command === "checkpoint-navigating";
    const finish = (): void => {
      if (isNavigating()) update(sessionId, (entry) => ({...entry, command: null, navigationTurnId: null}));
    };

    const executeNavigation = (force: boolean | undefined): Promise<CheckpointNavigationOutcome> =>
      rpcClient
        .run((rpc) => execute(rpc, force))
        .then((): CheckpointNavigationOutcome => {
          finish();
          return "applied";
        })
        .catch((cause: unknown): CheckpointNavigationOutcome => {
          const reason = cause instanceof CheckpointConflictError ? "conflict" : cause instanceof CheckpointUncapturedError ? "uncaptured" : undefined;
          if (reason && !force) {
            let pending = true;
            return {
              reason,
              cancel: () => {
                if (!pending) return;
                pending = false;
                finish();
              },
              confirm: () => {
                if (!pending) return Promise.resolve("failed");
                pending = false;
                if (!isNavigating()) return Promise.resolve("failed");
                return executeNavigation(true);
              },
            };
          }
          if (cause instanceof CheckpointInheritedError) {
            showToast("Nothing to undo in this fork", "This message came from the session this one was forked from. Only messages sent in this session can be undone.");
            finish();
            return "failed";
          }
          showToast(title, errorMessage(cause, "The session checkpoint could not be changed."));
          finish();
          return "failed";
        });

    return executeNavigation(input.force);
  };

  const undoCheckpoint = (input: CheckpointNavigationInput & NavigationTargets): Promise<CheckpointNavigationOutcome> =>
    runCheckpointNavigation({
      ...input,
      execute: (rpc, force) => rpc.undoCheckpoint({force, sessionId: input.sessionId}),
      turnId: input.lastTurnId,
      title: "Unable to undo checkpoint",
    });

  const redoCheckpoint = (input: CheckpointNavigationInput & NavigationTargets): Promise<CheckpointNavigationOutcome> =>
    runCheckpointNavigation({
      ...input,
      execute: (rpc, force) => rpc.redoCheckpoint({force, sessionId: input.sessionId}),
      turnId: input.firstUndoneTurnId,
      title: "Unable to redo checkpoint",
    });

  const revertToMessage = (input: RevertToMessageInput): Promise<CheckpointNavigationOutcome> =>
    runCheckpointNavigation({
      ...input,
      execute: (rpc, force) => rpc.revertToMessage({force, sessionId: input.sessionId, turnId: input.turnId}),
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
    settlePending,
    startSession,
    undoCheckpoint,
  };
});
