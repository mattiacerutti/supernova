import {method, nul, remote, str} from "@earendil-works/chord";
import type {Errors} from "@supernova/contracts/lib/errors";
import {json, serverHost} from "@supernova/contracts/lib/protocol";
import type {
  ArchiveSessionResult,
  ListComposerSuggestionsResult,
  ListModelsResult,
  SearchSessionsResult,
  SessionActivity,
  SessionNotice,
  SessionSetupStep,
} from "@supernova/contracts/services/sessions/procedures";
import {ArchiveSessionError, CreateSessionError, ForkSessionError, RenameSessionError} from "@supernova/contracts/services/sessions/procedures";
import {
  ArchiveSessionPayload,
  CreateSessionPayload,
  ForkSessionPayload,
  HideProjectPayload,
  OpenSessionPayload,
  ListComposerSuggestionsPayload,
  ListModelsPayload,
  LoadMoreProjectPayload,
  RenameSessionPayload,
  SearchSessionsPayload,
  PinSessionPayload,
  SessionReport,
  ShowProjectPayload,
} from "@supernova/contracts/services/sessions/procedures";
import type {SessionSummary} from "@supernova/contracts/services/sessions/schemas";

export type ListedSession = SessionSummary & {readonly projectPath: string};

export interface ProjectWindow {
  readonly depth: number;
  /** Not yet queried at this depth: `items` are the previous depth's. */
  readonly loading: boolean;
  readonly items: readonly ListedSession[];
  readonly hasMore: boolean;
}

export interface SessionsView {
  readonly projects: Readonly<Record<string, ProjectWindow>>;
  readonly open: ListedSession | null;
}

/** Every browser shares the owner principal, so `clientId` keeps one tab's view from another's. */
export const SessionsService = remote("supernova.sessions", {
  version: 6,
  params: {clientId: str()},
  hostAddress: serverHost,
  variants: {
    owner: {
      state: {view: json<SessionsView>()},
      methods: {
        showProject: method(ShowProjectPayload, nul()),
        hideProject: method(HideProjectPayload, nul()),
        loadMore: method(LoadMoreProjectPayload, nul()),
        openSession: method(OpenSessionPayload, nul()),
        closeSession: method(undefined, nul()),
        create: method(CreateSessionPayload, nul()),
        fork: method(ForkSessionPayload, json<ListedSession>()),
        rename: method(RenameSessionPayload, nul()),
        pin: method(PinSessionPayload, nul()),
        archive: method(ArchiveSessionPayload, json<ArchiveSessionResult>()),
        search: method(SearchSessionsPayload, json<SearchSessionsResult>()),
        listModels: method(ListModelsPayload, json<ListModelsResult>()),
        listComposerSuggestions: method(ListComposerSuggestionsPayload, json<ListComposerSuggestionsResult>()),
      },
    },
  },
});

export const SessionsErrors = {
  create: CreateSessionError,
  fork: ForkSessionError,
  rename: RenameSessionError,
  archive: ArchiveSessionError,
} satisfies Errors<typeof SessionsService>;

export interface SessionStatusEntry {
  readonly activeTurnSentAt?: string;
  readonly activity: SessionActivity;
  readonly setupStep: SessionSetupStep | null;
  readonly notices: readonly SessionNotice[];
}

export interface SessionStatuses {
  readonly sessions: Readonly<Record<string, SessionStatusEntry>>;
}

export const SessionStatusService = remote("supernova.session-status", {
  version: 4,
  params: {},
  hostAddress: serverHost,
  variants: {
    owner: {
      state: {statuses: json<SessionStatuses>()},
    },
    worker: {
      methods: {report: method(SessionReport, nul())},
    },
  },
});
