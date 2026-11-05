import type {Reference} from "@earendil-works/chord";
import {method, remote, str} from "@earendil-works/chord";
import {json, result, serverHost} from "@supernova/contracts/lib/protocol";
import type {
  ArchiveSessionError,
  ArchiveSessionPayload,
  ArchiveSessionResult,
  CreateSessionError,
  CreateSessionPayload,
  ForkSessionError,
  ForkSessionPayload,
  HideProjectPayload,
  OpenSessionPayload,
  ListComposerSuggestionsPayload,
  ListComposerSuggestionsResult,
  ListModelsPayload,
  ListModelsResult,
  LoadMoreProjectPayload,
  RenameSessionError,
  RenameSessionPayload,
  SearchSessionsPayload,
  SearchSessionsResult,
  PinSessionPayload,
  SessionActivity,
  SessionNotice,
  SessionReport,
  SessionSetupStep,
  ShowProjectPayload,
} from "@supernova/contracts/services/sessions/procedures";
import type {Session, SessionSummary} from "@supernova/contracts/services/sessions/schemas";

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
  /** Whether or not a window holds it: opened from search, below the loaded rows, or its project collapsed. */
  readonly open: ListedSession | null;
}

/** Every browser shares the owner principal, so `clientId` keeps one tab's view from another's. */
export const SessionsService = remote("supernova.sessions", {
  version: 4,
  params: {clientId: str()},
  hostAddress: serverHost,
  variants: {
    owner: {
      state: {view: json<SessionsView>()},
      methods: {
        /** Showing a shown project sets its depth. */
        showProject: method(json<ShowProjectPayload>(), result<null>()),
        hideProject: method(json<HideProjectPayload>(), result<null>()),
        loadMore: method(json<LoadMoreProjectPayload>(), result<null>()),
        /** Opening another replaces it. */
        openSession: method(json<OpenSessionPayload>(), result<null>()),
        closeSession: method(undefined, result<null>()),
        create: method(json<CreateSessionPayload>(), result<Session, CreateSessionError>()),
        fork: method(json<ForkSessionPayload>(), result<ListedSession, ForkSessionError>()),
        rename: method(json<RenameSessionPayload>(), result<null, RenameSessionError>()),
        pin: method(json<PinSessionPayload>(), result<null>()),
        archive: method(json<ArchiveSessionPayload>(), result<ArchiveSessionResult, ArchiveSessionError>()),
        search: method(json<SearchSessionsPayload>(), result<SearchSessionsResult>()),
        listModels: method(json<ListModelsPayload>(), result<ListModelsResult>()),
        listComposerSuggestions: method(json<ListComposerSuggestionsPayload>(), result<ListComposerSuggestionsResult>()),
      },
    },
  },
});

export type SessionsOwner = Extract<Reference<typeof SessionsService>, {readonly variant: "owner"}>;

export interface SessionStatusEntry {
  readonly activity: SessionActivity;
  readonly setupStep: SessionSetupStep | null;
  /** Problems that did not fail a command, newest last; capped, never cleared by a run. */
  readonly notices: readonly SessionNotice[];
}

export interface SessionStatuses {
  /** Sessions with something to show: running, being set up, or holding notices. Absent means idle with none. */
  readonly sessions: Readonly<Record<string, SessionStatusEntry>>;
}

/** A report from an older host generation, one that stopped while it travelled, is dropped. */
export const SessionStatusService = remote("supernova.session-status", {
  version: 1,
  params: {},
  hostAddress: serverHost,
  variants: {
    owner: {
      state: {statuses: json<SessionStatuses>()},
    },
    worker: {
      methods: {report: method(json<SessionReport>(), result<null>())},
    },
  },
});

export type SessionStatusOwner = Extract<Reference<typeof SessionStatusService>, {readonly variant: "owner"}>;
