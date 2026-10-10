import {mkdir, mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {Projects} from "@supernova/agent-runtime/features/projects/projects";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {SessionCatalog} from "@supernova/agent-runtime/pi/lib/session/session-catalog";
import {SessionStore} from "@supernova/agent-runtime/pi/session-store";
import {cleanupTempDirs} from "@tests/support/async";

function record(overrides: Partial<SessionRecord>): SessionRecord {
  return {id: "session-1", projectPath: "/workspace", pinned: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides};
}

describe("listing, searching, pinning, and archiving project sessions", () => {
  const tempDirs: string[] = [];
  const stores: SessionStore[] = [];

  afterEach(async () => {
    while (stores.length > 0) await stores.pop()!.dispose();
    cleanupTempDirs(tempDirs);
  });

  /** A store whose catalog holds `records`; no session file is opened. */
  async function projectsWith(records: readonly SessionRecord[]): Promise<{projects: Projects; store: SessionStore}> {
    const root = join(await mkdtemp(join(tmpdir(), "supernova-sessions-")), "sessions-v2");
    tempDirs.push(root);
    await mkdir(root, {recursive: true});
    const catalog = await SessionCatalog.open(join(root, "catalog.sqlite"));
    for (const item of records) catalog.insert(item);
    catalog.close();
    const store = new SessionStore({root, sdk: {} as never, resourceCache: {} as never, tools: () => []});
    stores.push(store);
    return {projects: new Projects({store}), store};
  }

  it("lists a project's sessions as summaries, pinned first, then newest", async () => {
    const {projects} = await projectsWith([
      record({id: "older", title: "Older", updatedAt: "2026-01-01T00:00:00.000Z"}),
      record({id: "newest", title: "Newest", updatedAt: "2026-01-03T00:00:00.000Z"}),
      record({id: "middle", updatedAt: "2026-01-02T00:00:00.000Z", worktree: {branch: "supernova/x", path: "/wt"}}),
      record({id: "pinned", title: "Pinned", pinned: true, forkedFrom: "older"}),
      record({id: "elsewhere", projectPath: "/other"}),
    ]);

    expect(await projects.listSessions({projectPath: "/workspace", limit: 10})).toEqual({
      projectPath: "/workspace",
      sessions: [
        {id: "pinned", forked: true, pinned: true, title: "Pinned", updatedAt: "2026-01-01T00:00:00.000Z", worktree: false},
        {id: "newest", forked: false, pinned: false, title: "Newest", updatedAt: "2026-01-03T00:00:00.000Z", worktree: false},
        {id: "middle", forked: false, pinned: false, title: "Untitled session", updatedAt: "2026-01-02T00:00:00.000Z", worktree: true},
        {id: "older", forked: false, pinned: false, title: "Older", updatedAt: "2026-01-01T00:00:00.000Z", worktree: false},
      ],
      nextCursor: null,
    });
  });

  it("pages a listing with cursors until the last page", async () => {
    const {projects} = await projectsWith(["a", "b", "c", "d", "e"].map((id, index) => record({id, updatedAt: `2026-01-0${index + 1}T00:00:00.000Z`})));

    const first = await projects.listSessions({projectPath: "/workspace", limit: 2});
    const second = await projects.listSessions({projectPath: "/workspace", limit: 2, cursor: first.nextCursor!});
    const last = await projects.listSessions({projectPath: "/workspace", limit: 2, cursor: second.nextCursor!});

    expect([first, second, last].map((page) => page.sessions.map((session) => session.id))).toEqual([["e", "d"], ["c", "b"], ["a"]]);
    expect(last.nextCursor).toBeNull();
    await expect(projects.listSessions({projectPath: "/workspace", limit: 2, cursor: "not-a-cursor"})).rejects.toThrow("The page cursor is invalid.");
  });

  it("searches titles across the given projects, newest first, with each session's project", async () => {
    const {projects} = await projectsWith([
      record({id: "a", title: "Fix login", updatedAt: "2026-01-01T00:00:00.000Z"}),
      record({id: "b", title: "Login page", projectPath: "/other", updatedAt: "2026-01-02T00:00:00.000Z"}),
      record({id: "c", title: "Login elsewhere", projectPath: "/ignored", updatedAt: "2026-01-03T00:00:00.000Z"}),
    ]);

    const first = await projects.searchSessions({query: " login ", projectPaths: ["/workspace", "/other"], limit: 1});
    const second = await projects.searchSessions({query: "login", projectPaths: ["/workspace", "/other"], limit: 1, cursor: first.nextCursor!});

    expect(first.sessions).toEqual([{id: "b", forked: false, pinned: false, projectPath: "/other", title: "Login page", updatedAt: "2026-01-02T00:00:00.000Z", worktree: false}]);
    expect(second).toMatchObject({sessions: [{id: "a", projectPath: "/workspace"}], nextCursor: null});
    expect(await projects.searchSessions({query: "login", projectPaths: [], limit: 10})).toEqual({sessions: [], nextCursor: null});
  });

  it("pins and unpins a session without changing its activity time", async () => {
    const {projects, store} = await projectsWith([record({id: "newer", updatedAt: "2026-01-02T00:00:00.000Z"}), record({id: "older"})]);

    await projects.pinSession({sessionId: "older", pinned: true});
    expect((await projects.listSessions({projectPath: "/workspace", limit: 10})).sessions.map((session) => session.id)).toEqual(["older", "newer"]);
    expect(await store.find("older")).toMatchObject({pinned: true, updatedAt: "2026-01-01T00:00:00.000Z"});

    await projects.pinSession({sessionId: "older", pinned: false});
    expect((await projects.listSessions({projectPath: "/workspace", limit: 10})).sessions.map((session) => session.id)).toEqual(["newer", "older"]);
    await expect(projects.pinSession({sessionId: "missing", pinned: true})).rejects.toThrow("Session not found.");
  });

  it("archives a session by removing it from the listing and keeps its record", async () => {
    const {projects, store} = await projectsWith([record({id: "session-1"})]);

    const result = await projects.archiveSession({projectPath: "/workspace", sessionId: "session-1"});

    expect(result).toEqual({projectPath: "/workspace", sessionId: "session-1"});
    expect((await projects.listSessions({projectPath: "/workspace", limit: 10})).sessions).toEqual([]);
    expect(await store.find("session-1")).toMatchObject({archivedAt: expect.any(String)});
  });

  it("fails clearly when archiving a missing session", async () => {
    const {projects} = await projectsWith([record({id: "session-1"})]);

    await expect(projects.archiveSession({projectPath: "/workspace", sessionId: "missing"})).rejects.toMatchObject({
      _tag: "ProjectSessionArchiveError",
      message: "Session not found.",
    });
  });
});
