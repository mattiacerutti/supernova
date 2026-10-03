import {mkdir} from "node:fs/promises";
import {dirname} from "node:path";
import {DatabaseSync} from "node:sqlite";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";

/** Time SQLite waits for a competing lock, as pi-durable's session files do. */
const BUSY_TIMEOUT_MS = 5_000;

/** Bumped with every schema change; `open` refuses a catalog written by a newer version. */
const SCHEMA_VERSION = 1;

/**
 * Listing is the hot query: a project's unarchived sessions, newest first. The index holds exactly those rows in that
 * order, so a listing (and a later keyset page, `updated_at < ? LIMIT n`) reads only what it returns.
 */
const SCHEMA = `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_path TEXT NOT NULL,
    worktree_branch TEXT,
    worktree_path TEXT,
    title TEXT,
    forked_from TEXT,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;
  CREATE INDEX sessions_by_project ON sessions (project_path, updated_at DESC) WHERE archived_at IS NULL;
`;

const COLUMNS = "id, project_path, worktree_branch, worktree_path, title, forked_from, archived_at, created_at, updated_at";

interface SessionRow {
  readonly id: string;
  readonly project_path: string;
  readonly worktree_branch: string | null;
  readonly worktree_path: string | null;
  readonly title: string | null;
  readonly forked_from: string | null;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** A row as a record; absent optional fields stay absent, as callers test them with `!== undefined`. */
function toRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    projectPath: row.project_path,
    ...(row.worktree_branch !== null && row.worktree_path !== null ? {worktree: {branch: row.worktree_branch, path: row.worktree_path}} : {}),
    ...(row.title !== null ? {title: row.title} : {}),
    ...(row.forked_from !== null ? {forkedFrom: row.forked_from} : {}),
    ...(row.archived_at !== null ? {archivedAt: row.archived_at} : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** A record's column values, in `COLUMNS` order. */
function toValues(record: SessionRecord): (string | null)[] {
  return [
    record.id,
    record.projectPath,
    record.worktree?.branch ?? null,
    record.worktree?.path ?? null,
    record.title ?? null,
    record.forkedFrom ?? null,
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
      if (version > SCHEMA_VERSION) throw new Error(`The session catalog at ${path} was written by a newer Supernova.`);
      if (version === 0) {
        database.exec("BEGIN IMMEDIATE");
        database.exec(SCHEMA);
        database.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
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

  /** A project's unarchived sessions, newest first. */
  public list(projectPath: string): SessionRecord[] {
    const rows = this.database
      .prepare(`SELECT ${COLUMNS} FROM sessions WHERE project_path = ? AND archived_at IS NULL ORDER BY updated_at DESC`)
      .all(projectPath) as unknown as SessionRow[];
    return rows.map(toRecord);
  }

  /** Adds a record; fails if its id exists. */
  public insert(record: SessionRecord): void {
    this.database.prepare(`INSERT INTO sessions (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...toValues(record));
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
        "UPDATE sessions SET project_path = ?, worktree_branch = ?, worktree_path = ?, title = ?, forked_from = ?, archived_at = ?, created_at = ?, updated_at = ? WHERE id = ?"
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
