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

export interface SessionDirectoryEntry {
  readonly projectPath: string;
  readonly summary: SessionSummary | null;
  readonly activity: SessionActivity;
  readonly setupStep: SessionSetupStep | null;
  /** Problems that did not fail a command, newest last; capped, never cleared by a run. */
  readonly notices: SessionNotice[];
}

export interface SessionDirectoryState {
  readonly sessions: Readonly<Record<string, SessionDirectoryEntry>>;
}

export const SessionsService = remote("supernova.sessions", {
  version: 1,
  input: SERVER_WIDE,
  variants: {
    default: {
      state: {
        // Written by session runtime, served here because a client reads it before following any session.
        directory: json<SessionDirectoryState>(),
      },
      methods: {
        create: method(json<CreateSessionPayload>(), result<Session, CreateSessionError>()),
        fork: method(json<ForkSessionPayload>(), result<Session, ForkSessionError>()),
        rename: method(json<RenameSessionPayload>(), result<Session, RenameSessionError>()),
        get: method(json<GetSessionPayload>(), result<Session>()),
        listModels: method(json<ListModelsPayload>(), result<ListModelsResult>()),
        listComposerSuggestions: method(json<ListComposerSuggestionsPayload>(), result<ListComposerSuggestionsResult>()),
      },
    },
  },
});

export type SessionsService = MembersOf<typeof SessionsService>;
