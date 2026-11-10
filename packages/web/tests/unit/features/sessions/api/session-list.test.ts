import type {ListedSession, SessionsView} from "@supernova/contracts/services/sessions/services";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {SessionsService} from "@supernova/contracts/services/sessions/services";
import {describe, expect, it, onTestFinished, vi} from "vitest";
import {SessionListView} from "@/features/sessions/api/sidebar/session-list";
import {Published, testRuntimeClient} from "@tests/support/test-server";

const ok = null;

function listed(id: string, projectPath: string): ListedSession {
  return {id, projectPath, title: id, updatedAt: "2026-01-01T00:00:00.000Z", pinned: false, forked: false};
}

function fakeList(sessions: Record<string, readonly ListedSession[]>) {
  const list = new Published<SessionsView>({projects: {}, open: null});
  const calls: string[] = [];
  const window = (projectPath: string, depth: number) => {
    const all = sessions[projectPath] ?? [];
    return {depth, loading: false, items: all.slice(0, depth), hasMore: all.length > depth};
  };
  const unused = async () => ok;
  const {client, close} = testRuntimeClient({
    server: defineFacet<RuntimePrincipal>((host) => {
      host.serve(SessionsService, (_params, _principal, self) => ({
        variant: "owner",
        members: {
          view: list.member(self),
          showProject: async ({depth, projectPath}) => {
            calls.push(`show ${projectPath} ${depth}`);
            list.change((draft) => void (draft.projects[projectPath] = window(projectPath, depth)));
            return ok;
          },
          hideProject: async ({projectPath}) => {
            calls.push(`hide ${projectPath}`);
            list.change((draft) => void delete draft.projects[projectPath]);
            return ok;
          },
          loadMore: async ({by, projectPath}) => {
            calls.push(`more ${projectPath} ${by}`);
            list.change((draft) => {
              const current = draft.projects[projectPath];
              if (current) draft.projects[projectPath] = window(projectPath, current.depth + by);
            });
            return ok;
          },
          openSession: unused,
          closeSession: unused,
          create: unused,
          fork: async () => listed("fork", "a"),
          rename: unused,
          pin: unused,
          archive: async ({projectPath, sessionId}) => ({projectPath, sessionId}),
          search: async () => ({sessions: [], nextCursor: null}),
          listModels: async () => [],
          listComposerSuggestions: async () => ({items: []}),
        },
      }));
    }),
    session: () => defineFacet<RuntimePrincipal>(() => undefined),
  });
  onTestFinished(close);
  return {calls, list, runtime: client};
}

describe("the tab's session list", () => {
  it("shows each project's own window from one list, and pages one project without touching another", async () => {
    const {calls, runtime} = fakeList({a: [listed("a1", "a"), listed("a2", "a"), listed("a3", "a")], b: [listed("b1", "b")]});
    const view = new SessionListView(runtime);
    view.show("a", 2);
    view.show("b", 2);

    await vi.waitFor(() => expect(view.state("a").pending).toBe(false));
    await vi.waitFor(() => expect(view.state("b").pending).toBe(false));
    expect(view.state("a")).toMatchObject({items: [{id: "a1"}, {id: "a2"}], hasMore: true, expanded: false});
    expect(view.state("b")).toMatchObject({items: [{id: "b1"}], hasMore: false});

    view.loadMore("a");
    await vi.waitFor(() => expect(view.state("a").items).toHaveLength(3));
    expect(view.state("a")).toMatchObject({hasMore: false, expanded: true, loadingMore: false});
    expect(view.state("b").items).toHaveLength(1);
    // A frame can land between the two shows, so b may be asked again; showing a project twice sets the same depth.
    expect(new Set(calls)).toEqual(new Set(["show a 2", "show b 2", "more a 2"]));
    expect(calls.at(-1)).toBe("more a 2");
  });

  it("hides a project once its last row releases it", async () => {
    const {calls, list, runtime} = fakeList({a: [listed("a1", "a")]});
    const view = new SessionListView(runtime);
    const first = view.show("a", 5);
    const second = view.show("a", 5);
    await vi.waitFor(() => expect(view.state("a").pending).toBe(false));

    first();
    expect(calls).not.toContain("hide a");
    second();
    await vi.waitFor(() => expect(list.current.projects).toEqual({}));
    expect(calls.filter((call) => call.startsWith("show"))).toEqual(["show a 5"]);
  });

  it("shows its projects again when the server's list comes back without them, as after a reconnect", async () => {
    const {calls, list, runtime} = fakeList({a: [listed("a1", "a")]});
    const view = new SessionListView(runtime);
    view.show("a", 5);
    await vi.waitFor(() => expect(view.state("a").pending).toBe(false));

    list.set({projects: {}, open: null});
    await vi.waitFor(() => expect(calls.filter((call) => call === "show a 5")).toHaveLength(2));
    await vi.waitFor(() => expect(view.state("a").items).toEqual([listed("a1", "a")]));
  });
});
