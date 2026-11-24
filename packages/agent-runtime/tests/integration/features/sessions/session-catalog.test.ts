import {mkdir, mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve, sep} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {Sessions} from "@supernova/agent-runtime/features/sessions/natives/sessions";
import type {SessionRecord} from "@supernova/agent-runtime/core/session-state";
import {SessionCatalog} from "@supernova/agent-runtime/features/sessions/natives/session-catalog";
import {cleanupTempDirs} from "@tests/support/async";
import {createPiTestRuntime} from "@tests/support/test-runtime";

function record(overrides: Partial<SessionRecord>): SessionRecord {
  return {id: "session-1", projectPath: "/workspace", pinned: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides};
}

const workspace = resolve("/workspace").split(sep).join("/");

describe("listing, searching, pinning, and archiving saved sessions", () => {
  const tempDirs: string[] = [];
  const opened: Sessions[] = [];
  const runtimes: {readonly unregister: () => Promise<void>}[] = [];

  afterEach(async () => {
    while (opened.length > 0) opened.pop()!.close();
    while (runtimes.length > 0) await runtimes.pop()!.unregister();
    cleanupTempDirs(tempDirs);
  });

  async function sessionsWith(records: readonly SessionRecord[]) {
    const root = join(await mkdtemp(join(tmpdir(), "supernova-sessions-")), "sessions-v2");
    tempDirs.push(root);
    await mkdir(root, {recursive: true});
    const catalog = await SessionCatalog.open(join(root, "catalog.sqlite"));
    for (const item of records) catalog.insert(item);
    catalog.close();
    const revision = {value: 0, set: (next: number) => void (revision.value = next)};
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const sessions = await Sessions.open({root, revision, sdk: pi.sdk, resourceCache: pi.resourceCache});
    opened.push(sessions);
    return {sessions, store: {find: async (sessionId: string) => sessions.find(sessionId)}, revision};
  }

  async function listProject(sessions: Sessions, projectPath: string, depth: number) {
    const window = sessions.view({projects: {[projectPath]: depth}, openId: null}).projects[projectPath]!;
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

  it("merges running chats at send time before limiting the window, without hiding committed activity", async () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 0, 1) + minute * 60_000).toISOString();
    const {sessions} = await sessionsWith([
      ...Array.from({length: 40}, (_, index) => record({id: `idle-${index}`, updatedAt: at(index)})),
      record({id: "running", updatedAt: at(45)}),
      record({id: "other", projectPath: "/other"}),
      record({id: "archived", archivedAt: at(40)}),
      record({id: "pin", pinned: true}),
    ]);
    const view = (depth: number, anchors: Record<string, string>) =>
      sessions.view({projects: {[workspace]: depth}, openId: null}, new Map(Object.entries(anchors))).projects[workspace]!;
    const running = {running: at(37.5), other: at(50), archived: at(50)};
    expect(view(3, running).items.map(({id}) => id)).toEqual(["pin", "idle-39", "idle-38"]);
    const deeper = view(5, running);
    expect(deeper.items.map(({id}) => id)).toEqual(["pin", "idle-39", "idle-38", "running", "idle-37"]);
    expect(deeper.items[3]?.updatedAt).toBe(at(45));
    expect(view(3, running).hasMore).toBe(true);
    expect(view(42, running).hasMore).toBe(false);
    expect(view(3, {}).items.map(({id}) => id)).toEqual(["pin", "running", "idle-39"]);
    // The send report can arrive before the catalog's first entry report.
    expect(view(2, {"idle-0": at(50)}).items.map(({id}) => id)).toEqual(["pin", "idle-0"]);
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
      code: "ArchiveSessionError",
      message: "Session not found.",
    });
  });

  it("moves the revision views follow on every catalog write", async () => {
    const {sessions, revision} = await sessionsWith([record({id: "session-1"})]);

    await sessions.rename({sessionId: "session-1", title: "Renamed"});
    await sessions.pin({sessionId: "session-1", pinned: true});
    await sessions.archive({projectPath: "/workspace", sessionId: "session-1"});

    expect(revision.value).toBe(3);
  });
});
