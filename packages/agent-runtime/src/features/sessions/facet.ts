import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {JsonRepresentation} from "@earendil-works/chord/json";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {
  ArchiveSessionError,
  ArchiveSessionPayload,
  CreateSessionError,
  CreateSessionPayload,
  ForkSessionError,
  ForkSessionPayload,
  HideProjectPayload,
  ListComposerSuggestionsPayload,
  ListModelsPayload,
  LoadMoreProjectPayload,
  PinSessionPayload,
  OpenSessionPayload,
  RenameSessionError,
  RenameSessionPayload,
  SearchSessionsPayload,
  SessionReport,
  ShowProjectPayload,
} from "@supernova/contracts/services/sessions/procedures";
import type {SessionStatuses, SessionsView} from "@supernova/contracts/services/sessions/services";
import {SessionsService, SessionStatusService} from "@supernova/contracts/services/sessions/services";
import type {AgentRuntime} from "@supernova/agent-runtime/composition/runtime";
import {action, method} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import {createSession} from "@supernova/agent-runtime/features/sessions/operations/create-session";
import {archiveSession} from "@supernova/agent-runtime/features/sessions/operations/archive-session";

export function sessionsFacet(runtime: AgentRuntime): Facet<RuntimePrincipal> {
  const {sessions, status, store, sessionHosts} = runtime;

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
                // Reports from an older host generation cannot change the current session's status.
                if (!sessionHosts.current(sessionId, generation)) return;

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

      if (!isOwner(principal)) {
        throw forbidden("Only the owner reads session status.");
      }

      const statuses = self.writable(status.all());

      self.open(
        async () => status.onChange(() => statuses.set(status.all())),
        (stop) => stop()
      );

      return {
        variant: "owner",
        members: {
          statuses: self.derive([statuses], ([value]) => value as JsonRepresentation<SessionStatuses>),
        },
      };
    });

    host.serve(
      SessionsService,
      // The client id only keeps one tab's view from another's; it carries no authority.
      (_params, principal, self) => {
        if (!isOwner(principal)) {
          throw forbidden("Only the owner manages sessions.");
        }

        const projects: Record<string, number> = {};
        let openId: string | null = null;
        const view = self.writable<SessionsView>({projects: {}, open: null});

        const read = self.open(
          () => sessions.viewReader(),
          () => undefined
        );

        function refreshView() {
          view.set(read.value({projects, openId}));
        }

        self.open(
          async () => store.onCatalogChange(refreshView),
          (stop) => stop()
        );

        return {
          variant: "owner",
          members: {
            view: self.derive([view], ([value]) => value as JsonRepresentation<SessionsView>),

            showProject: method({
              payload: ShowProjectPayload,
              run: async ({depth, projectPath}) => {
                projects[projectPath] = depth;
                refreshView();
              },
            }),

            hideProject: method({
              payload: HideProjectPayload,
              run: async ({projectPath}) => {
                delete projects[projectPath];
                refreshView();
              },
            }),

            loadMore: method({
              payload: LoadMoreProjectPayload,
              run: async ({by, projectPath}) => {
                const depth = projects[projectPath];

                if (depth !== undefined) {
                  projects[projectPath] = depth + by;
                }

                refreshView();
              },
            }),

            openSession: method({
              payload: OpenSessionPayload,
              run: async ({sessionId}) => {
                openId = sessionId;
                refreshView();
              },
            }),

            closeSession: action({
              run: async () => {
                openId = null;
                refreshView();
              },
            }),

            create: method({
              payload: CreateSessionPayload,
              error: CreateSessionError,
              run: (input) => createSession(input, runtime),
            }),

            fork: method({
              payload: ForkSessionPayload,
              error: ForkSessionError,
              run: async (input) => {
                const sessionId = await sessions.fork(input);
                const record = await sessions.record({sessionId});

                if (!record) {
                  throw new ForkSessionError({message: "The fork was not saved."});
                }

                return record;
              },
            }),

            rename: method({
              payload: RenameSessionPayload,
              error: RenameSessionError,
              run: (input) => sessions.rename(input),
            }),

            pin: method({
              payload: PinSessionPayload,
              run: (input) => sessions.pin(input),
            }),

            archive: method({
              payload: ArchiveSessionPayload,
              error: ArchiveSessionError,
              run: (input) => archiveSession(input, runtime),
            }),

            search: method({
              payload: SearchSessionsPayload,
              run: (input) => sessions.search(input),
            }),

            listModels: method({
              payload: ListModelsPayload,
              run: (input) => sessions.listModels(input),
            }),

            listComposerSuggestions: method({
              payload: ListComposerSuggestionsPayload,
              run: (input) => sessions.listComposerSuggestions(input),
            }),
          },
        };
      },
      // A view released by a reload of its page is taken again within this long, without re-querying.
      {linger: 10_000}
    );
  });
}
