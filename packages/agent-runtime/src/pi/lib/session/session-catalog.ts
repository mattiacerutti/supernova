import {mkdir} from "node:fs/promises";
import {dirname} from "node:path";
import {DatabaseSync} from "node:sqlite";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";

/** Time SQLite waits for a competing lock, as pi-durable's session files do. */
const BUSY_TIMEOUT_MS = 5_000;

/**
 * The schema, as the migrations that build it. Every schema change is a new entry at the end, never an edit to an
 * existing one: a catalog records how many it has run (SQLite's `user_version`), and `open` runs the rest. A catalog
 * from a newer Supernova has run more than this list knows and is refused.
 *
 * Both reads page through an index in its order, so a page reads only the rows it returns: a project's unarchived
 * sessions, pinned first then newest (`sessions_listing`), and every unarchived session newest first for title search
 * (`sessions_recent`). Pages continue after the last row with a row-value comparison on the same columns.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_path TEXT NOT NULL,
    worktree_branch TEXT,
    worktree_path TEXT,
    title TEXT,
    forked_from TEXT,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;
  CREATE INDEX sessions_listing ON sessions (project_path, pinned DESC, updated_at DESC, id DESC) WHERE archived_at IS NULL;
  CREATE INDEX sessions_recent ON sessions (updated_at DESC, id DESC) WHERE archived_at IS NULL;
  `,
];

const COLUMNS = "id, project_path, worktree_branch, worktree_path, title, forked_from, pinned, archived_at, created_at, updated_at";

interface SessionRow {
  readonly id: string;
  readonly project_path: string;
  readonly worktree_branch: string | null;
  readonly worktree_path: string | null;
  readonly title: string | null;
  readonly forked_from: string | null;
  readonly pinned: number;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** The row a page continues after, by the columns pages are ordered on. */
type PageKey = Pick<SessionRecord, "id" | "pinned" | "updatedAt">;

/** `value` as a literal inside a `LIKE` pattern escaped with `\`. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** A row as a record; absent optional fields stay absent, as callers test them with `!== undefined`. */
function toRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    projectPath: row.project_path,
    ...(row.worktree_branch !== null && row.worktree_path !== null ? {worktree: {branch: row.worktree_branch, path: row.worktree_path}} : {}),
    ...(row.title !== null ? {title: row.title} : {}),
    ...(row.forked_from !== null ? {forkedFrom: row.forked_from} : {}),
    pinned: row.pinned === 1,
    ...(row.archived_at !== null ? {archivedAt: row.archived_at} : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** A record's column values, in `COLUMNS` order. */
function toValues(record: SessionRecord): (string | number | null)[] {
  return [
    record.id,
    record.projectPath,
    record.worktree?.branch ?? null,
    record.worktree?.path ?? null,
    record.title ?? null,
    record.forkedFrom ?? null,
    record.pinned ? 1 : 0,
    record.archivedAt ?? null,
    record.createdAt,
    record.updatedAt,
  ];
}

/**
 * The record of every durable session, in one SQLite file beside the session files: what listing by project and
 * lookup by id read, so no session file is opened for either. The engine cannot list by project, so the catalog is
 * ours. Calls are synchronous, so a read-modify-write within one call cannot interleave with another.
 */
export class SessionCatalog {
  private constructor(private readonly database: DatabaseSync) {}

  /** Opens the catalog at `path`, creating it and its schema on first use. */
  public static async open(path: string): Promise<SessionCatalog> {
    await mkdir(dirname(path), {recursive: true});
    const database = new DatabaseSync(path, {timeout: BUSY_TIMEOUT_MS});
    try {
      database.exec("PRAGMA journal_mode = WAL");
      database.exec("PRAGMA synchronous = NORMAL");
      const {user_version: version} = database.prepare("PRAGMA user_version").get() as {user_version: number};
      if (version > MIGRATIONS.length) throw new Error(`The session catalog at ${path} was written by a newer version of Supernova.`);
      // Each migration commits on its own, so a crash between two leaves a catalog a later open finishes.
      for (let next = version; next < MIGRATIONS.length; next++) {
        database.exec("BEGIN IMMEDIATE");
        database.exec(MIGRATIONS[next]!);
        database.exec(`PRAGMA user_version = ${next + 1}`);
        database.exec("COMMIT");
      }
    } catch (error) {
      database.close();
      throw error;
    }
    return new SessionCatalog(database);
  }

  public find(sessionId: string): SessionRecord | undefined {
    const row = this.database.prepare(`SELECT ${COLUMNS} FROM sessions WHERE id = ?`).get(sessionId) as unknown as SessionRow | undefined;
    return row ? toRecord(row) : undefined;
  }

  /** One page of a project's unarchived sessions, pinned first, then newest; `after` is the last row of the page before. */
  public list(input: {readonly projectPath: string; readonly limit: number; readonly after?: PageKey}): SessionRecord[] {
    const {after, limit, projectPath} = input;
    const continued = after ? "AND (pinned, updated_at, id) < (?, ?, ?)" : "";
    const rows = this.database
      .prepare(`SELECT ${COLUMNS} FROM sessions WHERE project_path = ? AND archived_at IS NULL ${continued} ORDER BY pinned DESC, updated_at DESC, id DESC LIMIT ?`)
      .all(projectPath, ...(after ? [after.pinned ? 1 : 0, after.updatedAt, after.id] : []), limit) as unknown as SessionRow[];
    return rows.map(toRecord);
  }

  /**
   * One page of unarchived sessions whose title contains `query` (case-insensitive), newest first, in `projectPaths`
   * when given; `after` is the last row of the page before.
   */
  public search(input: {readonly query: string; readonly projectPaths?: readonly string[]; readonly limit: number; readonly after?: PageKey}): SessionRecord[] {
    const {after, limit, projectPaths, query} = input;
    const inProjects = projectPaths ? `AND project_path IN (${projectPaths.map(() => "?").join(", ")})` : "";
    const continued = after ? "AND (updated_at, id) < (?, ?)" : "";
    const rows = this.database
      .prepare(
        `SELECT ${COLUMNS} FROM sessions INDEXED BY sessions_recent WHERE archived_at IS NULL AND COALESCE(title, '') LIKE ? ESCAPE '\\' ${inProjects} ${continued} ORDER BY updated_at DESC, id DESC LIMIT ?`
      )
      .all(`%${escapeLike(query)}%`, ...(projectPaths ?? []), ...(after ? [after.updatedAt, after.id] : []), limit) as unknown as SessionRow[];
    return rows.map(toRecord);
  }

  /** Adds a record; fails if its id exists. */
  public insert(record: SessionRecord): void {
    this.database
      .prepare(
        `INSERT INTO sessions (${COLUMNS}) VALUES (${COLUMNS.split(", ")
          .map(() => "?")
          .join(", ")})`
      )
      .run(...toValues(record));
  }

  /** Applies `change` to an existing record and returns the result; throws for unknown ids. */
  public update(sessionId: string, change: (record: SessionRecord) => SessionRecord): SessionRecord {
    const current = this.find(sessionId);
    if (!current) throw new Error("Session not found.");
    const next = change(current);
    if (next.id !== sessionId) throw new Error("A session record keeps its id.");
    const [, ...values] = toValues(next);
    this.database
      .prepare(
        "UPDATE sessions SET project_path = ?, worktree_branch = ?, worktree_path = ?, title = ?, forked_from = ?, pinned = ?, archived_at = ?, created_at = ?, updated_at = ? WHERE id = ?"
      )
      .run(...values, sessionId);
    return next;
  }

  /** Removes a record; whether it existed. */
  public delete(sessionId: string): boolean {
    const existed = this.find(sessionId) !== undefined;
    if (existed) this.database.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return existed;
  }

  public close(): void {
    this.database.close();
  }
}
