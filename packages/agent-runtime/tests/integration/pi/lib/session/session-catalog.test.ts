import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {afterEach, describe, expect, it} from "vitest";
import {SessionCatalog} from "@supernova/agent-runtime/pi/lib/session/session-catalog";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";

function record(overrides: Partial<SessionRecord>): SessionRecord {
  return {id: "session-1", projectPath: "/workspace", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides};
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
      archivedAt: "2026-01-02T00:00:00.000Z",
    });
    catalog.insert(full);
    catalog.insert(record({id: "bare"}));

    expect(catalog.find("full")).toEqual(full);
    expect(catalog.find("bare")).toStrictEqual(record({id: "bare"}));
    expect(catalog.find("missing")).toBeUndefined();
  });

  it("lists one project's unarchived sessions newest first", async () => {
    const catalog = await open(path());
    catalog.insert(record({id: "older", updatedAt: "2026-01-01T00:00:00.000Z"}));
    catalog.insert(record({id: "newest", updatedAt: "2026-01-03T00:00:00.000Z"}));
    catalog.insert(record({id: "archived", updatedAt: "2026-01-04T00:00:00.000Z", archivedAt: "2026-01-04T00:00:00.000Z"}));
    catalog.insert(record({id: "elsewhere", projectPath: "/other", updatedAt: "2026-01-05T00:00:00.000Z"}));

    expect(catalog.list("/workspace").map((item) => item.id)).toEqual(["newest", "older"]);
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

  it("answers a project listing from its index, without scanning the table or sorting", async () => {
    const at = path();
    await open(at);
    const database = new DatabaseSync(at);
    try {
      const plan = database.prepare("EXPLAIN QUERY PLAN SELECT id FROM sessions WHERE project_path = ? AND archived_at IS NULL ORDER BY updated_at DESC").all("/workspace") as {
        detail: string;
      }[];
      const details = plan.map((step) => step.detail).join("\n");
      expect(details).toContain("sessions_by_project");
      expect(details).not.toContain("TEMP B-TREE");
    } finally {
      database.close();
    }
  });

  it("refuses a catalog written by a newer schema", async () => {
    const at = path();
    const database = new DatabaseSync(at);
    database.exec("PRAGMA user_version = 99");
    database.close();

    await expect(SessionCatalog.open(at)).rejects.toThrow("written by a newer Supernova");
  });
});
