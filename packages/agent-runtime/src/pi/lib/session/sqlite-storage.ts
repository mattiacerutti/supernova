import {mkdir} from "node:fs/promises";
import {dirname} from "node:path";
import type {SqliteDatabase, SqliteExecutor, SqliteValue} from "@earendil-works/pi-durable/storage/sqlite";
import {SqliteStorage} from "@earendil-works/pi-durable/storage/sqlite";

/** The synchronous statement surface `node:sqlite` and `bun:sqlite` share. */
interface SyncStatement {
  run(...params: SqliteValue[]): unknown;
  get(...params: SqliteValue[]): unknown;
  all(...params: SqliteValue[]): unknown[];
}

interface SyncDatabase {
  exec(sql: string): void;
  prepare(sql: string): SyncStatement;
  close(): void;
}

const BUSY_TIMEOUT_MS = 5_000;

/**
 * Opens the platform's synchronous SQLite. The packaged server and Electron run Node (`node:sqlite`); `bun run dev`
 * runs Bun, which lacks `node:sqlite` but ships `bun:sqlite` with the same statement surface.
 */
async function openSyncDatabase(path: string): Promise<SyncDatabase> {
  if (process.versions.bun) {
    const {Database} = (await import("bun:sqlite" as string)) as {Database: new (path: string, options: {create: boolean; strict: boolean}) => SyncDatabase};
    const database = new Database(path, {create: true, strict: true});
    database.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    return database;
  }
  const {DatabaseSync} = await import("node:sqlite");
  return new DatabaseSync(path, {timeout: BUSY_TIMEOUT_MS}) as unknown as SyncDatabase;
}

/**
 * The engine's async `SqliteDatabase` facade over a synchronous connection. Operations are serialized; a transaction
 * holds the queue until it settles, as the facade contract requires.
 */
class SyncSqliteDatabase implements SqliteDatabase {
  private readonly statements = new Map<string, SyncStatement>();
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  public constructor(private readonly database: SyncDatabase) {}

  public exec(sql: string): Promise<void> {
    return this.enqueue(() => this.executor(() => true).exec(sql));
  }

  public run(sql: string, ...params: SqliteValue[]): Promise<void> {
    return this.enqueue(() => this.executor(() => true).run(sql, ...params));
  }

  public get<T extends object>(sql: string, ...params: SqliteValue[]): Promise<T | undefined> {
    return this.enqueue(() => this.executor(() => true).get<T>(sql, ...params));
  }

  public all<T extends object>(sql: string, ...params: SqliteValue[]): Promise<T[]> {
    return this.enqueue(() => this.executor(() => true).all<T>(sql, ...params));
  }

  public transaction<T>(callback: (transaction: SqliteExecutor) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      this.database.exec("BEGIN IMMEDIATE");
      let active = true;
      try {
        const result = await callback(this.executor(() => active));
        active = false;
        this.database.exec("COMMIT");
        return result;
      } catch (error) {
        active = false;
        try {
          this.database.exec("ROLLBACK");
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], "SQLite transaction failed and rollback failed");
        }
        throw error;
      }
    });
  }

  public close(): Promise<void> {
    return this.enqueue(() => {
      if (this.closed) return;
      this.closed = true;
      this.statements.clear();
      try {
        this.database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      } finally {
        this.database.close();
      }
    });
  }

  private enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private executor(isActive: () => boolean): SqliteExecutor {
    const statement = (sql: string): SyncStatement => {
      if (!isActive()) throw new Error("SQLite transaction handle is no longer active");
      let prepared = this.statements.get(sql);
      if (!prepared) {
        prepared = this.database.prepare(sql);
        this.statements.set(sql, prepared);
      }
      return prepared;
    };
    return {
      exec: async (sql) => {
        if (!isActive()) throw new Error("SQLite transaction handle is no longer active");
        this.database.exec(sql);
      },
      run: async (sql, ...params) => {
        statement(sql).run(...params);
      },
      // bun:sqlite returns null for no row; the facade expects undefined.
      get: async <T extends object>(sql: string, ...params: SqliteValue[]) => (statement(sql).get(...params) ?? undefined) as T | undefined,
      all: async <T extends object>(sql: string, ...params: SqliteValue[]) => statement(sql).all(...params) as T[],
    };
  }
}

/** Opens durable SQLite storage at `path` in WAL mode, under Node or Bun. */
export async function openSqliteStorage(path: string): Promise<SqliteStorage> {
  await mkdir(dirname(path), {recursive: true});
  const database = new SyncSqliteDatabase(await openSyncDatabase(path));
  await database.exec("PRAGMA journal_mode = WAL");
  await database.exec("PRAGMA synchronous = NORMAL");
  return SqliteStorage.open(database);
}
