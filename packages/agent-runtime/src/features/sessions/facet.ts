import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import type {SessionsView} from "@supernova/contracts/services/sessions/services";
import {SessionsService, SessionStatusService} from "@supernova/contracts/services/sessions/services";
import type {AgentRuntime} from "@supernova/agent-runtime/composition/runtime";
import {action, method} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import {following} from "@supernova/agent-runtime/lib/chord/state";
import {createSession} from "@supernova/agent-runtime/features/sessions/operations/create-session";
import {archiveSession} from "@supernova/agent-runtime/features/sessions/operations/archive-session";
import {forkSession} from "@supernova/agent-runtime/features/sessions/operations/fork-session";

export function sessionsFacet(runtime: AgentRuntime): Facet<RuntimePrincipal> {
  const {sessions, status, store, sessionHosts} = runtime;

  return defineFacet<RuntimePrincipal>((host) => {
    host.serve(SessionStatusService, (_params, principal, self) => {
      if (principal.kind === "worker") {
        const {generation, sessionId} = principal;

        return {
          variant: "worker",
          members: {
            report: method(async (report) => {
              // Drops a report of a host that stopped while it travelled.
              if (!sessionHosts.current(sessionId, generation)) return;

              switch (report.kind) {
                case "activity":
                  return status.change(sessionId, {kind: "activity", activity: report.activity});
                case "notice":
                  return status.change(sessionId, {kind: "notice", notice: report.notice});
                case "sent":
                  return sessions.touch({sessionId, at: report.at});
                case "title":
                  return sessions.proposeTitle({sessionId, title: report.title});
              }
            }),
          },
        };
      }

      if (!isOwner(principal)) throw forbidden("Only the owner reads session status.");

      return {
        variant: "owner",
        members: {
          statuses: following(
            self,
            () => status.all(),
            (changed) => status.onChange(changed)
          ).member,
        },
      };
    });

    host.serve(
      SessionsService,
      (_params, principal, self) => {
        if (!isOwner(principal)) throw forbidden("Only the owner manages sessions.");

        const projects: Record<string, number> = {};
        let openId: string | null = null;
        const view = following<SessionsView>(
          self,
          () => sessions.view({projects, openId}),
          (changed) => store.onChange(changed)
        );

        return {
          variant: "owner",
          members: {
            view: view.member,

            showProject: method(async ({depth, projectPath}) => {
              projects[projectPath] = depth;
              view.refresh();
            }),

            hideProject: method(async ({projectPath}) => {
              delete projects[projectPath];
              view.refresh();
            }),

            loadMore: method(async ({by, projectPath}) => {
              const depth = projects[projectPath];
              if (depth !== undefined) projects[projectPath] = depth + by;
              view.refresh();
            }),

            openSession: method(async ({sessionId}) => {
              openId = sessionId;
              view.refresh();
            }),

            closeSession: action(async () => {
              openId = null;
              view.refresh();
            }),

            create: method((input) => createSession(input, runtime)),
            fork: method((input) => forkSession(input, runtime)),
            rename: method((input) => sessions.rename(input)),
            pin: method((input) => sessions.pin(input)),
            archive: method((input) => archiveSession(input, runtime)),
            search: method((input) => sessions.search(input)),
            listModels: method((input) => sessions.listModels(input)),
            listComposerSuggestions: method((input) => sessions.listComposerSuggestions(input)),
          },
        };
      },
      // A reloaded page takes its view back within this.
      {linger: 10_000}
    );
  });
}
