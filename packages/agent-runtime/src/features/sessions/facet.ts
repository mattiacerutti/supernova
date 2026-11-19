import type {Facet, FacetHost} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import {withoutAbortSignal} from "@earendil-works/chord/context";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import type {SessionStatuses} from "@supernova/contracts/services/sessions/services";
import {SessionsService, SessionStatusService} from "@supernova/contracts/services/sessions/services";
import {RuntimeConfig, RuntimeNative, SessionHostsNative} from "@supernova/agent-runtime/core/contract";
import {SessionCatalogStore, SessionOperations, SessionsNative, SessionStatusNative, SessionStatusStore} from "@supernova/agent-runtime/features/sessions/contract";
import {archiveSession} from "@supernova/agent-runtime/features/sessions/operations/archive-session";
import {createSession} from "@supernova/agent-runtime/features/sessions/operations/create-session";
import type {OperationDeps} from "@supernova/agent-runtime/features/sessions/operations/deps";
import {forkSession} from "@supernova/agent-runtime/features/sessions/operations/fork-session";
import {Sessions} from "@supernova/agent-runtime/features/sessions/natives/sessions";
import {SessionStatus} from "@supernova/agent-runtime/features/sessions/natives/session-status";
import {action, method} from "@supernova/agent-runtime/lib/chord/methods";
import {nativeOf, serveNative} from "@supernova/agent-runtime/lib/chord/natives";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import {derivedState} from "@supernova/agent-runtime/lib/chord/state";

export const sessionsFacet: Facet<RuntimePrincipal> = defineFacet<RuntimePrincipal>((host) => {
  serveCatalogStore(host);
  serveStatusStore(host);
  serveOperations(host);
  serveStatusService(host);
  serveSessionsService(host);
});

function serveCatalogStore(host: FacetHost<RuntimePrincipal>): void {
  serveNative(host, SessionsNative);

  host.serve(SessionCatalogStore, (_params, self) => {
    const config = self.get(RuntimeConfig, {});
    const natives = nativeOf(self, RuntimeNative);
    const revision = self.writable(0);

    const sessions = self.open(
      () => Sessions.open({root: config.paths.value.sessionsRoot, revision: revision, resourceCache: natives().resourceCache, sdk: natives().sdk}),
      (opened) => opened.close()
    );
    self.contribute(SessionsNative, sessions);

    return {revision: derivedState(self, [revision], ([value]) => value)};
  });
}

function serveStatusStore(host: FacetHost<RuntimePrincipal>): void {
  serveNative(host, SessionStatusNative);

  host.serve(SessionStatusStore, (_params, self) => {
    const statuses = self.writable<SessionStatuses>({sessions: {}});

    const status = self.open(
      async () => new SessionStatus(statuses),
      () => undefined
    );
    self.contribute(SessionStatusNative, status);

    return {statuses: derivedState(self, [statuses], ([value]) => value)};
  });
}

function serveOperations(host: FacetHost<RuntimePrincipal>): void {
  host.serve(SessionOperations, (_params, self) => {
    self.get(SessionCatalogStore, {});
    self.get(SessionStatusStore, {});
    const runtime = nativeOf(self, RuntimeNative);
    const deps: OperationDeps = {
      sessions: nativeOf(self, SessionsNative),
      status: nativeOf(self, SessionStatusNative),
      hosts: nativeOf(self, SessionHostsNative),
      checkpoints: () => runtime().checkpointStore,
    };

    return {
      create: async (input, ctx) => {
        await createSession(input, deps, ctx);
        return null;
      },
      fork: (input, ctx) => forkSession(input, deps, ctx),
      archive: (input, ctx) => archiveSession(input, deps, ctx),
    };
  });
}

function serveStatusService(host: FacetHost<RuntimePrincipal>): void {
  host.serve(SessionStatusService, (_params, principal, self) => {
    if (principal.kind === "worker") {
      const {generation, sessionId} = principal;
      self.get(SessionCatalogStore, {});
      self.get(SessionStatusStore, {});
      const hosts = nativeOf(self, SessionHostsNative);
      const sessions = nativeOf(self, SessionsNative);
      const status = nativeOf(self, SessionStatusNative);

      return {
        variant: "worker",
        members: {
          report: method(async (report) => {
            // Drops a report of a host that stopped while it travelled.
            if (!hosts().current(sessionId, generation)) return;

            switch (report.kind) {
              case "activity":
                return status().change(sessionId, {kind: "activity", activity: report.activity});
              case "notice":
                return status().change(sessionId, {kind: "notice", notice: report.notice});
              case "sent":
                return sessions().touch({sessionId, at: report.at});
              case "title":
                return sessions().proposeTitle({sessionId, title: report.title});
            }
          }),
        },
      };
    }

    if (!isOwner(principal)) throw forbidden("Only the owner reads session status.");

    return {variant: "owner", members: {statuses: self.get(SessionStatusStore, {}).statuses}};
  });
}

interface Shown {
  readonly projects: Readonly<Record<string, number>>;
  readonly openId: string | null;
}

function serveSessionsService(host: FacetHost<RuntimePrincipal>): void {
  host.serve(
    SessionsService,
    (_params, principal, self) => {
      if (!isOwner(principal)) throw forbidden("Only the owner manages sessions.");

      const catalog = self.get(SessionCatalogStore, {});
      const operations = self.get(SessionOperations, {});
      const sessions = nativeOf(self, SessionsNative);
      const shown = self.writable<Shown>({projects: {}, openId: null});

      const projects = (change: (projects: Record<string, number>) => void) => {
        const next = {...shown.value.projects};
        change(next);
        shown.set({...shown.value, projects: next});
      };

      return {
        variant: "owner",
        members: {
          view: derivedState(self, [catalog.revision, shown], ([, value]) => sessions().view(value as Shown)),

          showProject: method(async ({depth, projectPath}) => {
            projects((next) => {
              next[projectPath] = depth;
            });
          }),

          hideProject: method(async ({projectPath}) => {
            projects((next) => {
              delete next[projectPath];
            });
          }),

          loadMore: method(async ({by, projectPath}) => {
            projects((next) => {
              const depth = next[projectPath];
              if (depth !== undefined) next[projectPath] = depth + by;
            });
          }),

          openSession: method(async ({sessionId}) => {
            shown.set({...shown.value, openId: sessionId});
          }),

          closeSession: action(async () => {
            shown.set({...shown.value, openId: null});
          }),

          // Accepted work outlives the browser's call.
          create: method((input, ctx) => operations.create(input, withoutAbortSignal(ctx))),
          fork: method((input, ctx) => operations.fork(input, withoutAbortSignal(ctx))),
          rename: method((input) => sessions().rename(input)),
          pin: method((input) => sessions().pin(input)),
          archive: method((input, ctx) => operations.archive(input, withoutAbortSignal(ctx))),
          search: method((input) => sessions().search(input)),
          listModels: method((input) => sessions().listModels(input)),
          listComposerSuggestions: method((input) => sessions().listComposerSuggestions(input)),
        },
      };
    },
    // A reloaded page takes its view back within this.
    {linger: 10_000}
  );
}
