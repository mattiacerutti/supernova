import type {Ctx, Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import type {ArchiveSessionPayload, ArchiveSessionResult, CreateSessionPayload} from "@supernova/contracts/services/sessions/procedures";
import {
  ArchiveSessionError,
  ArchiveSessionPayload as ArchiveSessionPayloadSchema,
  CreateSessionError,
  CreateSessionPayload as CreateSessionPayloadSchema,
  ForkSessionError,
  ForkSessionPayload,
  HideProjectPayload,
  ListComposerSuggestionsPayload,
  ListModelsPayload,
  LoadMoreProjectPayload,
  PinSessionPayload,
  OpenSessionPayload,
  PROJECT_WINDOW_LIMIT,
  RenameSessionError,
  RenameSessionPayload,
  SearchSessionsPayload,
  SessionReport,
  ShowProjectPayload,
} from "@supernova/contracts/services/sessions/procedures";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import type {SessionsView} from "@supernova/contracts/services/sessions/services";
import {SessionsService, SessionStatusService} from "@supernova/contracts/services/sessions/services";
import {action, method} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import {published} from "@supernova/agent-runtime/lib/chord/state";
import type {Sessions} from "@supernova/agent-runtime/features/sessions/sessions";
import type {SessionStatus} from "@supernova/agent-runtime/features/sessions/status/session-status";
import type {SessionStore} from "@supernova/agent-runtime/pi/session-store";

export interface SessionWorkflows {
  readonly create: (input: CreateSessionPayload, ctx: Ctx<RuntimePrincipal>) => Promise<Session>;
  readonly archive: (input: ArchiveSessionPayload) => Promise<ArchiveSessionResult>;
}

export interface SessionsFacetDeps {
  readonly sessions: Sessions;
  readonly status: SessionStatus;
  readonly store: Pick<SessionStore, "onCatalogChange">;
  readonly workflows: SessionWorkflows;
  readonly isCurrent: (sessionId: string, generation: number) => boolean;
}

export function sessionsFacet(deps: SessionsFacetDeps): Facet<RuntimePrincipal> {
  const {sessions, status, workflows} = deps;

  return defineFacet<RuntimePrincipal>((host) => {
    host.serve(SessionStatusService, (_params, principal, self) => {
      if (principal.kind === "worker") {
        const {generation, sessionId} = principal;
        return {
          variant: "worker",
          members: {
            report: method({
              payload: SessionReport,
              run: async (report) => {
                // A report of a host that stopped while it travelled: its successor reports for the session now.
                if (!deps.isCurrent(sessionId, generation)) return;
                switch (report.kind) {
                  case "activity":
                    return status.change(sessionId, {kind: "activity", activity: report.activity});
                  case "notice":
                    return status.change(sessionId, {kind: "notice", notice: report.notice});
                  case "sent":
                    return sessions.touch({sessionId});
                  case "title":
                    return sessions.proposeTitle({sessionId, title: report.title});
                }
              },
            }),
          },
        };
      }
      if (!isOwner(principal)) throw forbidden("Only the owner reads session status.");
      const statuses = published(self, status.all());
      self.open(
        async () => status.onChange(() => statuses.set(status.all())),
        (stop) => stop()
      );
      return {variant: "owner", members: {statuses: statuses.member}};
    });

    host.serve(
      SessionsService,
      // The client id only keeps one tab's view from another's; it carries no authority.
      (_params, principal, self) => {
        if (!isOwner(principal)) throw forbidden("Only the owner manages sessions.");
        const projects: Record<string, number> = {};
        let openId: string | null = null;
        const view = published<SessionsView>(self, {projects: {}, open: null});
        const read = self.open(
          () => sessions.viewReader(),
          () => undefined
        );
        const rebuild = () => view.set(read.value({projects, openId}));
        self.open(
          async () => deps.store.onCatalogChange(rebuild),
          (stop) => stop()
        );
        const showing = (change: () => void) => async () => {
          change();
          rebuild();
        };

        return {
          variant: "owner",
          members: {
            view: view.member,
            showProject: method({payload: ShowProjectPayload, run: ({depth, projectPath}) => showing(() => void (projects[projectPath] = depth))()}),
            hideProject: method({payload: HideProjectPayload, run: ({projectPath}) => showing(() => void delete projects[projectPath])()}),
            loadMore: method({
              payload: LoadMoreProjectPayload,
              run: ({by, projectPath}) =>
                showing(() => {
                  if (projects[projectPath] !== undefined) projects[projectPath] = Math.min(PROJECT_WINDOW_LIMIT, projects[projectPath] + by);
                })(),
            }),
            openSession: method({payload: OpenSessionPayload, run: ({sessionId}) => showing(() => void (openId = sessionId))()}),
            closeSession: action({run: () => showing(() => void (openId = null))()}),
            create: method({payload: CreateSessionPayloadSchema, run: (input, ctx) => workflows.create(input, ctx), error: CreateSessionError}),
            fork: method({
              payload: ForkSessionPayload,
              run: async (input) => {
                const record = await sessions.record({sessionId: await sessions.fork(input)});
                if (!record) throw new ForkSessionError({message: "The fork was not saved."});
                return record;
              },
              error: ForkSessionError,
            }),
            rename: method({payload: RenameSessionPayload, run: (input) => sessions.rename(input), error: RenameSessionError}),
            pin: method({payload: PinSessionPayload, run: (input) => sessions.pin(input)}),
            archive: method({payload: ArchiveSessionPayloadSchema, run: (input) => workflows.archive(input), error: ArchiveSessionError}),
            search: method({payload: SearchSessionsPayload, run: (input) => sessions.search(input)}),
            listModels: method({payload: ListModelsPayload, run: (input) => sessions.listModels(input)}),
            listComposerSuggestions: method({payload: ListComposerSuggestionsPayload, run: (input) => sessions.listComposerSuggestions(input)}),
          },
        };
      },
      // A view released by a reload of its page is taken again within this long, without re-querying.
      {linger: 10_000}
    );
  });
}
