import type {MembersOf} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import type {SessionActivity, SessionNotice, SessionSetupStep} from "@supernova/contracts/services/session-runtime/procedures";
import {json, result, SERVER_WIDE} from "@supernova/contracts/lib/protocol";
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

/** What clients see of a session the server has open, whether or not they follow it. */
export interface SessionDirectoryEntry {
  readonly projectPath: string;
  /** Its listing summary, once the session has a record; it changes with the title and activity time. */
  readonly summary: SessionSummary | null;
  readonly activity: SessionActivity;
  /** Setup step running before a new session's first turn. */
  readonly setupStep: SessionSetupStep | null;
  /** Problems that did not fail a command, newest last; capped, never cleared by a run. */
  readonly notices: SessionNotice[];
}

export interface SessionDirectoryState {
  /** Sessions the server opened since it started, keyed by id; an archived session leaves. */
  readonly sessions: Readonly<Record<string, SessionDirectoryEntry>>;
}

/**
 * Sessions: their lifecycle, reads, what a project offers the composer, and every open session's activity. A running
 * session's own commands and document are `SessionRuntimeService`.
 */
export const SessionsService = remote("supernova.sessions", {
  version: 1,
  input: SERVER_WIDE,
  variants: {
    default: {
      state: {
        /**
         * Every session the server has open, for sessions the client does not follow. Session runtime writes it
         * (activity, setup, problems); it is served here because a client reads it before following any session.
         */
        directory: json<SessionDirectoryState>(),
      },
      methods: {
        /** Creates a session under the client's id and starts its first turn; the session is removed again if it cannot start. */
        create: method(json<CreateSessionPayload>(), result<Session, CreateSessionError>()),
        /** Copies the conversation through a turn into a new session. */
        fork: method(json<ForkSessionPayload>(), result<Session, ForkSessionError>()),
        rename: method(json<RenameSessionPayload>(), result<Session, RenameSessionError>()),
        /** One read of a session, for a session the client does not follow (a prefetch). */
        get: method(json<GetSessionPayload>(), result<Session>()),
        listModels: method(json<ListModelsPayload>(), result<ListModelsResult>()),
        /** The skills and prompt templates a project's composer can reference. */
        listComposerSuggestions: method(json<ListComposerSuggestionsPayload>(), result<ListComposerSuggestionsResult>()),
      },
    },
  },
});

export type SessionsService = MembersOf<typeof SessionsService>;
