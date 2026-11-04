import {mkdir, mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve, sep} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {Sessions} from "@supernova/agent-runtime/features/sessions/sessions";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {SessionCatalog} from "@supernova/agent-runtime/pi/lib/session/session-catalog";
import {SessionStore} from "@supernova/agent-runtime/pi/session-store";
import {cleanupTempDirs} from "@tests/support/async";

function record(overrides: Partial<SessionRecord>): SessionRecord {
  return {id: "session-1", projectPath: "/workspace", pinned: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides};
}

const workspace = resolve("/workspace").split(sep).join("/");

describe("listing, searching, pinning, and archiving saved sessions", () => {
  const tempDirs: string[] = [];
  const stores: SessionStore[] = [];

  afterEach(async () => {
    while (stores.length > 0) await stores.pop()!.dispose();
    cleanupTempDirs(tempDirs);
  });

  /** A store whose catalog holds `records`; no session file is opened. */
  async function sessionsWith(records: readonly SessionRecord[]): Promise<{sessions: Sessions; store: SessionStore}> {
    const root = join(await mkdtemp(join(tmpdir(), "supernova-sessions-")), "sessions-v2");
    tempDirs.push(root);
    await mkdir(root, {recursive: true});
    const catalog = await SessionCatalog.open(join(root, "catalog.sqlite"));
    for (const item of records) catalog.insert(item);
    catalog.close();
    const store = new SessionStore({root, sdk: {} as never, resourceCache: {} as never, extensions: []});
    stores.push(store);
    return {sessions: new Sessions({store, sdk: {} as never, resourceCache: {} as never}), store};
  }

  /** A project's window as a tab's view shows it: its first `depth` sessions, and whether more follow. */
  async function listProject(sessions: Sessions, projectPath: string, depth: number) {
    const window = (await sessions.viewReader())({projects: {[projectPath]: depth}, openId: null}).projects[projectPath]!;
    return {items: window.items, hasMore: window.hasMore};
  }

  it("lists a project's first sessions, pinned first, then newest, and says whether more follow", async () => {
    const {sessions} = await sessionsWith([
      record({id: "older", title: "Older", updatedAt: "2026-01-01T00:00:00.000Z"}),
      record({id: "newest", title: "Newest", updatedAt: "2026-01-03T00:00:00.000Z"}),
      record({id: "middle", updatedAt: "2026-01-02T00:00:00.000Z", worktree: {branch: "supernova/x", path: "/wt"}}),
      record({id: "pinned", title: "Pinned", pinned: true, forkedFrom: "older"}),
      record({id: "elsewhere", projectPath: "/other"}),
    ]);

    expect(await listProject(sessions, "/workspace", 10)).toEqual({
      items: [
        {id: "pinned", forked: true, pinned: true, projectPath: workspace, title: "Pinned", updatedAt: "2026-01-01T00:00:00.000Z"},
        {id: "newest", forked: false, pinned: false, projectPath: workspace, title: "Newest", updatedAt: "2026-01-03T00:00:00.000Z"},
        {
          id: "middle",
          forked: false,
          pinned: false,
          projectPath: workspace,
          title: "Untitled session",
          updatedAt: "2026-01-02T00:00:00.000Z",
          worktree: {branch: "supernova/x", path: "/wt"},
        },
        {id: "older", forked: false, pinned: false, projectPath: workspace, title: "Older", updatedAt: "2026-01-01T00:00:00.000Z"},
      ],
      hasMore: false,
    });
    const first = await listProject(sessions, "/workspace", 2);
    expect(first.items.map((item) => item.id)).toEqual(["pinned", "newest"]);
    expect(first.hasMore).toBe(true);
  });

  it("deepens a project's window without skipping or repeating sessions", async () => {
    const {sessions} = await sessionsWith(["a", "b", "c", "d", "e"].map((id, index) => record({id, updatedAt: `2026-01-0${index + 1}T00:00:00.000Z`})));

    const windows = await Promise.all([2, 4, 6].map((depth) => listProject(sessions, "/workspace", depth)));

    expect(windows.map((window) => window.items.map((session) => session.id))).toEqual([
      ["e", "d"],
      ["e", "d", "c", "b"],
      ["e", "d", "c", "b", "a"],
    ]);
    expect(windows.map((window) => window.hasMore)).toEqual([true, true, false]);
  });

  it("searches titles across the given projects, newest first, with each session's project", async () => {
    const {sessions} = await sessionsWith([
      record({id: "a", title: "Fix login", updatedAt: "2026-01-01T00:00:00.000Z"}),
      record({id: "b", title: "Login page", projectPath: "/other", updatedAt: "2026-01-02T00:00:00.000Z"}),
      record({id: "c", title: "Login elsewhere", projectPath: "/ignored", updatedAt: "2026-01-03T00:00:00.000Z"}),
    ]);

    const search = (limit: number, cursor?: string) => sessions.search({text: " login ", projectPaths: ["/workspace", "/other"], limit, ...(cursor ? {cursor} : {})});

    const first = await search(1);
    expect(first.sessions).toEqual([
      {id: "b", forked: false, pinned: false, projectPath: resolve("/other").split(sep).join("/"), title: "Login page", updatedAt: "2026-01-02T00:00:00.000Z"},
    ]);
    expect(first.nextCursor).not.toBeNull();
    expect(await search(1, first.nextCursor!)).toMatchObject({sessions: [{id: "a", projectPath: workspace}], nextCursor: null});
    expect(await search(2)).toMatchObject({sessions: [{id: "b"}, {id: "a"}], nextCursor: null});
    expect(await sessions.search({text: "login", projectPaths: [], limit: 10})).toEqual({sessions: [], nextCursor: null});
  });

  it("pins and unpins a session without changing its activity time", async () => {
    const {sessions, store} = await sessionsWith([record({id: "newer", updatedAt: "2026-01-02T00:00:00.000Z"}), record({id: "older"})]);
    const order = async () => (await listProject(sessions, "/workspace", 10)).items.map((session) => session.id);

    await sessions.pin({sessionId: "older", pinned: true});
    expect(await order()).toEqual(["older", "newer"]);
    expect(await store.find("older")).toMatchObject({pinned: true, updatedAt: "2026-01-01T00:00:00.000Z"});

    await sessions.pin({sessionId: "older", pinned: false});
    expect(await order()).toEqual(["newer", "older"]);
    await expect(sessions.pin({sessionId: "missing", pinned: true})).rejects.toThrow("Session not found.");
  });

  it("keeps a generated title only while the session has none", async () => {
    const {sessions, store} = await sessionsWith([record({id: "untitled"}), record({id: "renamed", title: "Mine"})]);

    await sessions.proposeTitle({sessionId: "untitled", title: "Generated"});
    await sessions.proposeTitle({sessionId: "renamed", title: "Generated"});

    expect(await store.find("untitled")).toMatchObject({title: "Generated"});
    expect(await store.find("renamed")).toMatchObject({title: "Mine"});
  });

  it("archives a session by removing it from the listing and keeps its record", async () => {
    const {sessions, store} = await sessionsWith([record({id: "session-1"})]);

    const result = await sessions.archive({projectPath: "/workspace", sessionId: "session-1"});

    expect(result).toEqual({projectPath: "/workspace", sessionId: "session-1"});
    expect((await listProject(sessions, "/workspace", 10)).items).toEqual([]);
    expect(await store.find("session-1")).toMatchObject({archivedAt: expect.any(String)});
  });

  it("fails clearly when archiving a missing session", async () => {
    const {sessions} = await sessionsWith([record({id: "session-1"})]);

    await expect(sessions.archive({projectPath: "/workspace", sessionId: "missing"})).rejects.toMatchObject({
      _tag: "ArchiveSessionError",
      message: "Session not found.",
    });
  });

  it("tells listening views after every catalog write", async () => {
    const {sessions, store} = await sessionsWith([record({id: "session-1"})]);
    let writes = 0;
    const stop = store.onCatalogChange(() => void writes++);

    await sessions.rename({sessionId: "session-1", title: "Renamed"});
    await sessions.pin({sessionId: "session-1", pinned: true});
    await sessions.archive({projectPath: "/workspace", sessionId: "session-1"});
    stop();
    await sessions.touch({sessionId: "session-1"});

    expect(writes).toBe(3);
  });
});
