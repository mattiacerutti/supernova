import {mkdir} from "node:fs/promises";
import {dirname} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {resolveProjectPath} from "@supernova/agent-runtime/lib/project-path";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";

const BUSY_TIMEOUT_MS = 5_000;

/**
 * Append-only: a schema change is a new entry, never an edit. `user_version` records how many ran; a newer catalog is
 * refused.
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
  "UPDATE sessions SET project_path = resolve_project_path(project_path);",
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

type PageKey = Pick<SessionRecord, "id" | "pinned" | "updatedAt">;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

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

function toValues(record: SessionRecord): (string | number | null)[] {
  return [
    record.id,
    resolveProjectPath(record.projectPath),
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

/** Calls are synchronous, so a read-modify-write cannot interleave. */
export class SessionCatalog {
  private constructor(private readonly database: DatabaseSync) {}

  public static async open(path: string): Promise<SessionCatalog> {
    await mkdir(dirname(path), {recursive: true});
    const database = new DatabaseSync(path, {timeout: BUSY_TIMEOUT_MS});
    try {
      database.exec("PRAGMA journal_mode = WAL");
      database.exec("PRAGMA synchronous = NORMAL");
      const {user_version: version} = database.prepare("PRAGMA user_version").get() as {user_version: number};
      if (version > MIGRATIONS.length) throw new Error(`The session catalog at ${path} was written by a newer version of Supernova.`);
      database.function("resolve_project_path", (path) => resolveProjectPath(String(path)));
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

  public list(input: {readonly projectPath: string; readonly limit: number; readonly after?: PageKey}): SessionRecord[] {
    const {after, limit, projectPath} = input;
    const continued = after ? "AND (pinned, updated_at, id) < (?, ?, ?)" : "";
    const rows = this.database
      .prepare(`SELECT ${COLUMNS} FROM sessions WHERE project_path = ? AND archived_at IS NULL ${continued} ORDER BY pinned DESC, updated_at DESC, id DESC LIMIT ?`)
      .all(resolveProjectPath(projectPath), ...(after ? [after.pinned ? 1 : 0, after.updatedAt, after.id] : []), limit) as unknown as SessionRow[];
    return rows.map(toRecord);
  }

  public search(input: {readonly query: string; readonly projectPaths?: readonly string[]; readonly limit: number; readonly after?: PageKey}): SessionRecord[] {
    const {after, limit, projectPaths, query} = input;
    const inProjects = projectPaths ? `AND project_path IN (${projectPaths.map(() => "?").join(", ")})` : "";
    const continued = after ? "AND (updated_at, id) < (?, ?)" : "";
    const rows = this.database
      .prepare(
        `SELECT ${COLUMNS} FROM sessions INDEXED BY sessions_recent WHERE archived_at IS NULL AND COALESCE(title, '') LIKE ? ESCAPE '\\' ${inProjects} ${continued} ORDER BY updated_at DESC, id DESC LIMIT ?`
      )
      .all(`%${escapeLike(query)}%`, ...(projectPaths?.map(resolveProjectPath) ?? []), ...(after ? [after.updatedAt, after.id] : []), limit) as unknown as SessionRow[];
    return rows.map(toRecord);
  }

  public insert(record: SessionRecord): void {
    this.database
      .prepare(
        `INSERT INTO sessions (${COLUMNS}) VALUES (${COLUMNS.split(", ")
          .map(() => "?")
          .join(", ")})`
      )
      .run(...toValues(record));
  }

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
    return {...next, projectPath: resolveProjectPath(next.projectPath)};
  }

  public delete(sessionId: string): boolean {
    const existed = this.find(sessionId) !== undefined;
    if (existed) this.database.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return existed;
  }

  public close(): void {
    this.database.close();
  }
}
