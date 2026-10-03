import type {Context, ReplicatedState} from "@earendil-works/chord";
import {defineService} from "@earendil-works/chord";
import type {
  CompactSessionPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  SessionActivity,
  SessionSetupStep,
  UndoCheckpointPayload,
} from "@supernova/contracts/session-runtime/procedures";
import type {CreateSessionPayload, ForkSessionPayload, GetSessionPayload, RenameSessionPayload} from "@supernova/contracts/sessions/procedures";
import type {Session, SessionSummary} from "@supernova/contracts/sessions/schemas";

/**
 * The logical identity of a Supernova server on the session service protocol. A client checks it in the server's
 * hello; the server's URL already selects the server, so every Supernova server uses the same identity.
 */
export const SESSION_SERVER_ID = "3f8c2a64-5d1e-4b7a-9c2f-6e1d0a8b4c57";

/** Path of the session service protocol's WebSocket, beside the RPC one. */
export const SESSION_SERVICES_PATH = "/pi";

/** Why a session service call failed. `code` is the contract error class's tag, such as `CheckpointConflictError`. */
export interface ServiceFailure {
  readonly code: string;
  readonly message: string;
}

/**
 * The outcome of a session service call. Expected failures are results rather than thrown errors: the protocol
 * carries only its own error codes, and the client needs the contract's.
 */
export type ServiceResult<T> = {readonly ok: true; readonly value: T} | {readonly ok: false; readonly error: ServiceFailure};

/** What clients see of a session the server has open, whether or not they attached it. */
export interface SessionDirectoryEntry {
  readonly projectPath: string;
  /** Its listing summary, once the session has a record; it changes with the title and activity time. */
  readonly summary: SessionSummary | null;
  readonly activity: SessionActivity;
  /** Setup step running before a new session's first turn. */
  readonly setupStep: SessionSetupStep | null;
  /** The last problem that did not fail a command (an unanswered input, an extension diagnostic), cleared by the next run. */
  readonly error: {readonly message: string; readonly at: string} | null;
}

export interface SessionDirectoryState {
  /** Sessions the server opened since it started, keyed by id; an archived session leaves. */
  readonly sessions: Readonly<Record<string, SessionDirectoryEntry>>;
}

/** Server-wide: every open session's activity and summary, for sessions the client has not attached. */
export interface SessionDirectory {
  readonly state: ReplicatedState<SessionDirectoryState>;
}

/** Server-wide session lifecycle, and which session this connection's session services are bound to. */
export interface SessionManagement {
  /** Creates a session under the client's id and starts its first turn; the session is removed again if it cannot start. */
  create(payload: CreateSessionPayload, context: Context): Promise<ServiceResult<Session>>;
  /** Copies the conversation through a turn into a new session. */
  fork(payload: ForkSessionPayload, context: Context): Promise<ServiceResult<Session>>;
  rename(payload: RenameSessionPayload, context: Context): Promise<ServiceResult<Session>>;
  /** One read of a session, for a session the connection has not attached (a prefetch). */
  read(payload: GetSessionPayload, context: Context): Promise<ServiceResult<Session>>;
  /** Binds this connection's session services to a session, replacing the previous one. */
  attach(sessionId: string, context: Context): Promise<ServiceResult<null>>;
  detach(context: Context): Promise<void>;
}

/** Commands on the attached session. */
export interface SessionController {
  /** Starts a turn; resolves once the engine placed the input. */
  send(payload: Omit<SendMessagePayload, "sessionId">, context: Context): Promise<ServiceResult<null>>;
  /** Stops the session's preparation, run, and queued inputs. */
  abort(context: Context): Promise<void>;
  compact(payload: Omit<CompactSessionPayload, "sessionId">, context: Context): Promise<ServiceResult<null>>;
  undo(payload: Omit<UndoCheckpointPayload, "sessionId">, context: Context): Promise<ServiceResult<null>>;
  redo(payload: Omit<RedoCheckpointPayload, "sessionId">, context: Context): Promise<ServiceResult<null>>;
  revert(payload: Omit<RevertToMessagePayload, "sessionId">, context: Context): Promise<ServiceResult<null>>;
}

/** The attached session's document: Pi's entries and documents plus what Supernova adds. */
export interface SessionTranscript {
  readonly state: ReplicatedState<Session>;
}

export const SessionDirectory = defineService<SessionDirectory>("supernova.session-directory");
export const SessionManagement = defineService<SessionManagement>("supernova.session-management");
export const SessionController = defineService<SessionController>("supernova.session-controller");
export const SessionTranscript = defineService<SessionTranscript>("supernova.session-transcript");
