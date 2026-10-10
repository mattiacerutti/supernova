import type {Context, ReplicatedState} from "@earendil-works/chord";
import {defineService} from "@earendil-works/chord";
import type {SessionActivity, SessionSetupStep} from "@supernova/contracts/services/session-runtime/procedures";
import type {ServiceResult} from "@supernova/contracts/lib/protocol";
import type {
  CreateSessionError,
  CreateSessionPayload,
  ForkSessionError,
  ForkSessionPayload,
  GetSessionPayload,
  ListComposerSuggestionsPayload,
  ListComposerSuggestionsResult,
  ListModelsPayload,
  ListModelsResult,
  RenameSessionError,
  RenameSessionPayload,
} from "@supernova/contracts/services/sessions/procedures";
import type {Session, SessionSummary} from "@supernova/contracts/services/sessions/schemas";

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

/**
 * Sessions: their lifecycle, reads, what a project offers the composer, and every open session's activity. `attach`
 * routes this connection's `SessionRuntimeService` to one running session.
 */
export interface SessionsService {
  /**
   * Every session the server has open, for sessions the client has not attached. Session runtime writes it (activity,
   * setup, problems); it is served here because a client reads it before attaching anything.
   */
  readonly directory: ReplicatedState<SessionDirectoryState>;
  /** Creates a session under the client's id and starts its first turn; the session is removed again if it cannot start. */
  create(payload: CreateSessionPayload, context: Context): Promise<ServiceResult<Session, CreateSessionError>>;
  /** Copies the conversation through a turn into a new session. */
  fork(payload: ForkSessionPayload, context: Context): Promise<ServiceResult<Session, ForkSessionError>>;
  rename(payload: RenameSessionPayload, context: Context): Promise<ServiceResult<Session, RenameSessionError>>;
  /** One read of a session, for a session the connection has not attached (a prefetch). */
  get(payload: GetSessionPayload, context: Context): Promise<ServiceResult<Session>>;
  listModels(payload: ListModelsPayload, context: Context): Promise<ServiceResult<ListModelsResult>>;
  /** The skills and prompt templates a project's composer can reference. */
  listComposerSuggestions(payload: ListComposerSuggestionsPayload, context: Context): Promise<ServiceResult<ListComposerSuggestionsResult>>;
  /** Binds this connection's `SessionRuntimeService` to a session, replacing the previous one. */
  attach(sessionId: string, context: Context): Promise<ServiceResult<null>>;
  detach(context: Context): Promise<ServiceResult<null>>;
}

export const SessionsService = defineService<SessionsService>("supernova.sessions");
