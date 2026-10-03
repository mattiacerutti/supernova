import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {QueryClient} from "@tanstack/react-query";
import type {SessionActivity, SessionSetupStep} from "@supernova/contracts/services/session-runtime/procedures";
import type {ModelReference, OutgoingMessage, Session, SessionWorkspaceSelection, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import type {SessionRuntimeService} from "@supernova/contracts/services/session-runtime/services";
import type {SessionDirectoryState} from "@supernova/contracts/services/sessions/services";
import {create} from "zustand";
import {useSettingsStore} from "@/stores/settings-store";
import {showToast} from "@/lib/toast";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {runtimeError, unwrap} from "@/rpc/runtime-result";
import type {AttachedSession, RuntimeClient} from "@/rpc/transport/runtime-client";

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
 * Query's and changes only with the server's replicated transcript; what the server's directory says the session is
 * doing, and what the user just did and the server has not shown yet, lives here.
 */
export interface SessionLiveState {
  readonly error: string | null;
  /** What the server says the session is doing; known for every session the server has open. */
  readonly activity: SessionActivity;
  /** Command started here and not settled yet. */
  readonly command: "checkpoint-navigating" | "compacting" | "stopping" | null;
  readonly pending: PendingMessage | null;
  /** Turn an optimistic undo, redo, or revert moves to, until the command settles. */
  readonly navigationTurnId: string | null;
  /** Setup step running before a new session's first turn, shown in place of the thinking label. Set optimistically for steps the client asked for. */
  readonly setupStep: SessionSetupStep | null;
  readonly status: SessionLiveStatus;
}

/** Creates baseline state for sessions first seen in the directory. */
function emptyEntry(): SessionLiveState {
  return {activity: "idle", command: null, error: null, navigationTurnId: null, pending: null, setupStep: null, status: "idle"};
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

/** The session the server will create for a first message, shown until the server's document replaces it. */
function createPendingSession(input: {projectPath: string; sessionId: string}): Session {
  return {
    id: input.sessionId,
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
  readonly services: RuntimeClient;
  readonly sessionId: string;
}

/** The first message of a session that does not exist yet; the server creates it under `sessionId` with this message. */
interface StartSessionInput extends SendSessionMessageInput {
  readonly projectPath: string;
  readonly workspace: SessionWorkspaceSelection;
}

interface CompactSessionInput {
  readonly modelReference: ModelReference;
  readonly services: RuntimeClient;
  readonly sessionId: string;
}

interface CheckpointNavigationInput {
  /** Set when retrying after the user confirmed discarding manual workspace changes. */
  readonly force?: boolean;
  readonly queryClient: QueryClient;
  readonly services: RuntimeClient;
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
  /** Session currently open in the main view; its transcript is followed and its activity is stamped as seen. */
  readonly activeSessionId: string | null;
  readonly sessions: Record<string, SessionLiveState | undefined>;
  readonly abortSession: (input: {services: RuntimeClient; sessionId: string}) => void;
  /** Takes the server's activity, setup step, and last problem of every session it has open. */
  readonly applyDirectory: (directory: SessionDirectoryState) => void;
  readonly compactSession: (input: CompactSessionInput) => void;
  readonly redoCheckpoint: (input: CheckpointNavigationInput & NavigationTargets) => Promise<CheckpointNavigationOutcome>;
  readonly revertToMessage: (input: RevertToMessageInput) => Promise<CheckpointNavigationOutcome>;
  readonly sendMessage: (input: SendSessionMessageInput) => void;
  readonly setActiveSession: (sessionId: string | null) => void;
  /** Drops the pending message once the session's state has more turns than when it was sent. */
  readonly settlePending: (sessionId: string, turnCount: number) => void;
  readonly startSession: (input: StartSessionInput) => Promise<StartSessionOutcome>;
  readonly undoCheckpoint: (input: CheckpointNavigationInput & NavigationTargets) => Promise<CheckpointNavigationOutcome>;
}

export const useSessionLiveStore = create<SessionLiveStoreState>()((set, get) => {
  /** Problems already shown, by session, so the directory republishing one does not show it again. */
  const seenErrors = new Map<string, string>();

  const update = (sessionId: string, change: (entry: SessionLiveState) => Omit<SessionLiveState, "status"> | SessionLiveState): void => {
    set((state) => ({sessions: {...state.sessions, [sessionId]: withStatus(change(state.sessions[sessionId] ?? emptyEntry()))}}));
  };

  const applyDirectory = (directory: SessionDirectoryState): void => {
    set((state) => {
      const sessions = {...state.sessions};
      for (const [sessionId, entry] of Object.entries(directory.sessions)) {
        const current = sessions[sessionId] ?? emptyEntry();
        const errorKey = entry.error ? `${entry.error.at}:${entry.error.message}` : undefined;
        const newError = errorKey !== undefined && seenErrors.get(sessionId) !== errorKey;
        if (errorKey) seenErrors.set(sessionId, errorKey);
        const next = withStatus({
          ...current,
          activity: entry.activity,
          // The step the client set optimistically stays until the server reports one or the run starts.
          setupStep: entry.setupStep ?? (entry.activity === "idle" && current.pending ? current.setupStep : null),
          error: newError ? entry.error!.message : entry.activity === "running" ? null : current.error,
          ...(newError ? {pending: null, command: current.command === "stopping" ? null : current.command} : {}),
        });
        if (JSON.stringify(next) !== JSON.stringify(current)) sessions[sessionId] = next;
      }
      return {sessions};
    });
  };

  /**
   * The attached session's runtime service. Chord's service facades answer every member, `then` included, so one must
   * never be what a promise resolves with: that would call a remote `then`. The attachment record is returned and the
   * service read from it.
   */
  const attached = (services: RuntimeClient, sessionId: string): Promise<AttachedSession> => services.attach(sessionId);

  const settlePending = (sessionId: string, count: number): void => {
    const pending = get().sessions[sessionId]?.pending;
    if (pending && count > pending.turnCount) update(sessionId, (entry) => ({...entry, pending: null}));
  };

  const setActiveSession = (sessionId: string | null): void => {
    set((state) => (state.activeSessionId === sessionId ? state : {activeSessionId: sessionId}));
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
    return {captureCheckpoints: useSettingsStore.getState().captureCheckpoints, contentParts: [...contentParts], modelReference};
  };

  const failPendingMessage = (sessionId: string, error: string | null): void => {
    update(sessionId, (entry) => ({...entry, command: entry.command === "stopping" ? null : entry.command, error, pending: null}));
  };

  const sendMessage = (input: SendSessionMessageInput): void => {
    const {queryClient, services, sessionId} = input;
    const current = get().sessions[sessionId];
    if (current && current.status !== "idle") return;

    const message = beginPendingMessage(input);
    void attached(services, sessionId)
      .then(({sessionRuntime}) => unwrap(sessionRuntime.sendMessage(message, BACKGROUND_CONTEXT)))
      .then(() => settlePending(sessionId, turnCount(queryClient.getQueryData<Session>(sessionKeys.detail(sessionId)))))
      .catch((cause: unknown) => failPendingMessage(sessionId, errorMessage(cause, "Failed to send message.")));
  };

  const startSession = async (input: StartSessionInput): Promise<StartSessionOutcome> => {
    const {projectPath, queryClient, services, sessionId, workspace} = input;
    queryClient.setQueryData<Session>(sessionKeys.detail(sessionId), createPendingSession({projectPath, sessionId}));
    const message = beginPendingMessage(input);
    // The worktree step starts before any directory update can arrive; showing it now keeps the thinking label from flashing first.
    if (workspace.mode === "worktree") update(sessionId, (entry) => ({...entry, setupStep: "worktree"}));

    try {
      const session = await unwrap(services.sessions.create({id: sessionId, message, projectPath, workspace}, BACKGROUND_CONTEXT));
      // The transcript's first value replaces this once the page attaches; until then the reply is the newest state.
      queryClient.setQueryData<Session>(sessionKeys.detail(sessionId), (cached) => (cached && turnCount(cached) > turnCount(session) ? cached : session));
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

  const abortSession = (input: {services: RuntimeClient; sessionId: string}): void => {
    const {services, sessionId} = input;
    const stream = get().sessions[sessionId];
    if (!stream || (stream.status !== "streaming" && stream.status !== "stopping")) return;

    update(sessionId, (entry) => ({...entry, command: "stopping"}));
    void attached(services, sessionId)
      .then(({sessionRuntime}) => sessionRuntime.abort(BACKGROUND_CONTEXT))
      .catch(() => update(sessionId, (entry) => ({...entry, command: entry.command === "stopping" ? null : entry.command})));
  };

  const compactSession = (input: CompactSessionInput): void => {
    const {modelReference, services, sessionId} = input;
    const current = get().sessions[sessionId];
    if (current && current.status !== "idle") return;

    update(sessionId, (entry) => ({...entry, command: "compacting", error: null}));
    const finish = (error: string | null): void =>
      update(sessionId, (entry) => ({...entry, command: entry.command === "compacting" ? null : entry.command, ...(error ? {error} : {})}));
    void attached(services, sessionId)
      .then(({sessionRuntime}) => unwrap(sessionRuntime.compact({modelReference}, BACKGROUND_CONTEXT)))
      .then(
        () => finish(null),
        (cause: unknown) => finish(errorMessage(cause, "Failed to compact session."))
      );
  };

  const runCheckpointNavigation = (
    input: CheckpointNavigationInput & {
      execute: (session: SessionRuntimeService, force: boolean | undefined) => ReturnType<SessionRuntimeService["undoCheckpoint"]>;
      turnId: string | undefined;
      title: string;
    }
  ): Promise<CheckpointNavigationOutcome> => {
    const {execute, services, sessionId, title, turnId} = input;
    const current = get().sessions[sessionId];
    if (current && current.status !== "idle") return Promise.resolve("failed");

    update(sessionId, (entry) => ({...entry, command: "checkpoint-navigating", error: null, navigationTurnId: turnId ?? null}));

    const isNavigating = (): boolean => get().sessions[sessionId]?.command === "checkpoint-navigating";
    const finish = (): void => {
      if (isNavigating()) update(sessionId, (entry) => ({...entry, command: null, navigationTurnId: null}));
    };

    const executeNavigation = (force: boolean | undefined): Promise<CheckpointNavigationOutcome> =>
      attached(services, sessionId)
        .then(({sessionRuntime}) => unwrap(execute(sessionRuntime, force)))
        .then((): CheckpointNavigationOutcome => {
          finish();
          return "applied";
        })
        .catch((cause: unknown): CheckpointNavigationOutcome => {
          const code = runtimeError<SessionRuntimeService["undoCheckpoint"]>(cause)?.code;
          const reason = code === "CheckpointConflictError" ? "conflict" : code === "CheckpointUncapturedError" ? "uncaptured" : undefined;
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
          if (code === "CheckpointInheritedError") {
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
      execute: (session, force) => session.undoCheckpoint({force}, BACKGROUND_CONTEXT),
      turnId: input.lastTurnId,
      title: "Unable to undo checkpoint",
    });

  const redoCheckpoint = (input: CheckpointNavigationInput & NavigationTargets): Promise<CheckpointNavigationOutcome> =>
    runCheckpointNavigation({
      ...input,
      execute: (session, force) => session.redoCheckpoint({force}, BACKGROUND_CONTEXT),
      turnId: input.firstUndoneTurnId,
      title: "Unable to redo checkpoint",
    });

  const revertToMessage = (input: RevertToMessageInput): Promise<CheckpointNavigationOutcome> =>
    runCheckpointNavigation({
      ...input,
      execute: (session, force) => session.revertToMessage({force, turnId: input.turnId}, BACKGROUND_CONTEXT),
      title: "Unable to revert message",
    });

  return {
    abortSession,
    activeSessionId: null,
    applyDirectory,
    compactSession,
    redoCheckpoint,
    revertToMessage,
    sendMessage,
    sessions: {},
    setActiveSession,
    settlePending,
    startSession,
    undoCheckpoint,
  };
});
