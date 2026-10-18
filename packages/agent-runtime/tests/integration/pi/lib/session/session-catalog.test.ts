import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve, sep} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {afterEach, describe, expect, it} from "vitest";
import {SessionCatalog} from "@supernova/agent-runtime/pi/lib/session/session-catalog";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";

function record(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    id: "session-1",
    projectPath: resolve("/workspace").split(sep).join("/"),
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("session catalog", () => {
  const dirs: string[] = [];
  const catalogs: SessionCatalog[] = [];

  afterEach(() => {
    while (catalogs.length > 0) catalogs.pop()!.close();
    while (dirs.length > 0) rmSync(dirs.pop()!, {force: true, recursive: true});
  });

  function path(): string {
    const dir = mkdtempSync(join(tmpdir(), "sn-catalog-"));
    dirs.push(dir);
    return join(dir, "catalog.sqlite");
  }

  async function open(at: string): Promise<SessionCatalog> {
    const catalog = await SessionCatalog.open(at);
    catalogs.push(catalog);
    return catalog;
  }

  it("round-trips every field, and leaves absent optional fields absent", async () => {
    const catalog = await open(path());
    const full = record({
      id: "full",
      worktree: {branch: "supernova/x", path: "/wt"},
      title: "Title",
      forkedFrom: "source",
      pinned: true,
      archivedAt: "2026-01-02T00:00:00.000Z",
    });
    catalog.insert(full);
    catalog.insert(record({id: "bare"}));

    expect(catalog.find("full")).toEqual(full);
    expect(catalog.find("bare")).toStrictEqual(record({id: "bare"}));
    expect(catalog.find("missing")).toBeUndefined();
  });

  it("pages one project's unarchived sessions, pinned first, then newest", async () => {
    const catalog = await open(path());
    catalog.insert(record({id: "older", updatedAt: "2026-01-01T00:00:00.000Z"}));
    catalog.insert(record({id: "newest", updatedAt: "2026-01-03T00:00:00.000Z"}));
    catalog.insert(record({id: "pinned", pinned: true, updatedAt: "2026-01-00T00:00:00.000Z"}));
    // Same time: the id breaks the tie, so a page boundary never skips or repeats a row.
    catalog.insert(record({id: "tie-a", updatedAt: "2026-01-02T00:00:00.000Z"}));
    catalog.insert(record({id: "tie-b", updatedAt: "2026-01-02T00:00:00.000Z"}));
    catalog.insert(record({id: "archived", updatedAt: "2026-01-04T00:00:00.000Z", archivedAt: "2026-01-04T00:00:00.000Z"}));
    catalog.insert(record({id: "elsewhere", projectPath: "/other", updatedAt: "2026-01-05T00:00:00.000Z"}));

    const pages: string[][] = [];
    let after: SessionRecord | undefined;
    do {
      const page = catalog.list({projectPath: "/workspace", limit: 2, ...(after ? {after} : {})});
      pages.push(page.map((item) => item.id));
      after = page.length === 2 ? page.at(-1) : undefined;
    } while (after);

    expect(pages).toEqual([["pinned", "newest"], ["tie-b", "tie-a"], ["older"]]);
  });

  it("searches titles case-insensitively, literally, across the given projects, newest first", async () => {
    const catalog = await open(path());
    catalog.insert(record({id: "a", title: "Fix the Login bug", updatedAt: "2026-01-01T00:00:00.000Z"}));
    catalog.insert(record({id: "b", title: "login page", projectPath: "/other", updatedAt: "2026-01-03T00:00:00.000Z"}));
    catalog.insert(record({id: "c", title: "100% done_now", updatedAt: "2026-01-02T00:00:00.000Z"}));
    catalog.insert(record({id: "d", title: "Unrelated", updatedAt: "2026-01-04T00:00:00.000Z"}));
    catalog.insert(record({id: "e", title: "login archived", archivedAt: "2026-01-05T00:00:00.000Z"}));
    catalog.insert(record({id: "f", title: "login elsewhere", projectPath: "/ignored"}));
    const ids = (query: string, after?: SessionRecord) =>
      catalog.search({query, projectPaths: ["/workspace", "/other"], limit: 10, ...(after ? {after} : {})}).map((item) => item.id);

    expect(ids("LOGIN")).toEqual(["b", "a"]);
    // `%` and `_` match themselves.
    expect(ids("0% done_")).toEqual(["c"]);
    expect(ids("%")).toEqual(["c"]);
    expect(ids("")).toEqual(["d", "b", "c", "a"]);
    expect(ids("", catalog.find("b"))).toEqual(["c", "a"]);
  });

  it.runIf(process.platform === "win32").each([
    {stored: "C:\\Users\\Alice\\app", requested: "C:/Users/Alice/app"},
    {stored: "C:/Users/Alice/app", requested: "C:\\Users\\Alice\\app"},
    {stored: "C:\\Users/Alice\\app", requested: "C:/Users/Alice/app"},
    {stored: "C:/Users/Alice/app/./src/..", requested: "C:/Users/Alice/app/"},
    {stored: "\\\\server\\share\\app", requested: "//server/share/app"},
    {stored: "//server/share/app", requested: "\\\\server\\share\\app"},
  ])("matches Windows project separators: $stored → $requested", async ({stored, requested}) => {
    const catalog = await open(path());
    catalog.insert(record({projectPath: stored, title: "Old session"}));
    catalog.insert(record({id: "other", projectPath: `${stored}-other`, title: "Old session"}));
    const ids = () => catalog.list({projectPath: requested, limit: 5}).map((session) => session.id);

    expect(ids()).toEqual(["session-1"]);
    expect(catalog.search({projectPaths: [requested], query: "Old", limit: 5}).map((session) => session.id)).toEqual(["session-1"]);
    const updated = catalog.update("session-1", (current) => ({...current, projectPath: requested, pinned: true}));
    expect(ids()).toEqual(["session-1"]);
    expect(catalog.find("session-1")).toEqual(updated);
  });

  it.skipIf(process.platform === "win32")("keeps literal backslashes in POSIX project names distinct from separators", async () => {
    const catalog = await open(path());
    catalog.insert(record({projectPath: "/workspace/a\\b"}));
    expect(catalog.list({projectPath: "/workspace/a\\b", limit: 5}).map((session) => session.id)).toEqual(["session-1"]);
    expect(catalog.list({projectPath: "/workspace/a/b", limit: 5})).toEqual([]);
  });

  it("updates and deletes records, and refuses unknown or re-keyed ones", async () => {
    const catalog = await open(path());
    catalog.insert(record({id: "s"}));

    expect(catalog.update("s", (current) => ({...current, title: "Renamed"}))).toMatchObject({title: "Renamed"});
    expect(catalog.find("s")?.title).toBe("Renamed");
    expect(() => catalog.update("missing", (current) => current)).toThrow("Session not found.");
    expect(() => catalog.update("s", (current) => ({...current, id: "other"}))).toThrow("A session record keeps its id.");
    expect(() => catalog.insert(record({id: "s"}))).toThrow();

    expect(catalog.delete("s")).toBe(true);
    expect(catalog.delete("s")).toBe(false);
    expect(catalog.find("s")).toBeUndefined();
  });

  it("keeps records across reopening", async () => {
    const at = path();
    const first = await SessionCatalog.open(at);
    first.insert(record({id: "kept", title: "Kept"}));
    first.close();

    expect((await open(at)).find("kept")).toMatchObject({title: "Kept"});
  });

  it.each([
    {
      name: "a project's next page",
      index: "sessions_listing",
      sql: "SELECT id FROM sessions WHERE project_path = ? AND archived_at IS NULL AND (pinned, updated_at, id) < (?, ?, ?) ORDER BY pinned DESC, updated_at DESC, id DESC LIMIT ?",
      params: ["/workspace", 0, "2026-01-01", "s", 20],
    },
    {
      name: "a search's next page",
      index: "sessions_recent",
      sql: "SELECT id FROM sessions INDEXED BY sessions_recent WHERE archived_at IS NULL AND COALESCE(title, '') LIKE ? AND (updated_at, id) < (?, ?) ORDER BY updated_at DESC, id DESC LIMIT ?",
      params: ["%x%", "2026-01-01", "s", 20],
    },
  ])("reads $name from its index in order, without sorting", async ({index, params, sql}) => {
    const at = path();
    await open(at);
    const database = new DatabaseSync(at);
    try {
      const details = (database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as {detail: string}[]).map((step) => step.detail).join("\n");
      expect(details).toContain(index);
      expect(details).not.toContain("TEMP B-TREE");
    } finally {
      database.close();
    }
  });

  it.runIf(process.platform === "win32")("repairs Windows project paths already imported into a version 1 catalog", async () => {
    const at = path();
    const first = await SessionCatalog.open(at);
    first.insert(record({id: "drive", title: "Kept title", pinned: true}));
    first.insert(record({id: "unc"}));
    first.insert(record({id: "posix"}));
    first.close();

    const database = new DatabaseSync(at);
    try {
      const update = database.prepare("UPDATE sessions SET project_path = ? WHERE id = ?");
      update.run("C:\\Users\\Alice\\app", "drive");
      update.run("\\\\server\\share\\app", "unc");
      update.run("/workspace/a\\b", "posix");
      database.exec("PRAGMA user_version = 1");
    } finally {
      database.close();
    }

    const catalog = await open(at);
    expect(catalog.list({projectPath: "C:/Users/Alice/app", limit: 5})).toEqual([record({id: "drive", projectPath: "C:/Users/Alice/app", title: "Kept title", pinned: true})]);
    expect(catalog.search({projectPaths: ["//server/share/app"], query: "", limit: 5}).map((session) => session.id)).toEqual(["unc"]);
    expect(catalog.find("posix")?.projectPath).toBe(resolve("/workspace/a\\b").split(sep).join("/"));
  });

  it("migrates a catalog to the current schema and keeps its records, and refuses one from a newer Supernova", async () => {
    const at = path();
    const first = await open(at);
    first.insert(record({id: "kept"}));
    const version = () => {
      const database = new DatabaseSync(at);
      try {
        return (database.prepare("PRAGMA user_version").get() as {user_version: number}).user_version;
      } finally {
        database.close();
      }
    };
    const current = version();
    expect(current).toBeGreaterThan(0);
    first.close();
    catalogs.pop();

    // Reopening a current catalog runs nothing and keeps its records.
    const reopened = await open(at);
    expect(version()).toBe(current);
    expect(reopened.find("kept")?.id).toBe("kept");
    reopened.close();
    catalogs.pop();

    // A catalog from a newer Supernova has run migrations this version does not know.
    const database = new DatabaseSync(at);
    database.exec(`PRAGMA user_version = ${current + 1}`);
    database.close();
    await expect(SessionCatalog.open(at)).rejects.toThrow("written by a newer version of Supernova");
  });
});
