import {existsSync} from "node:fs";
import {rm} from "node:fs/promises";
import {join} from "node:path";
import {getAgentDir} from "@earendil-works/pi-coding-agent";
import type {SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import {resolveProjectPath} from "@supernova/agent-runtime/lib/project-path";
import {SessionCatalog} from "@supernova/agent-runtime/pi/lib/session/session-catalog";
import {importLegacySessions} from "@supernova/agent-runtime/pi/lib/session/legacy/legacy-sessions";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";

/** The old SDK's, which also holds its project folders until they are imported. */
const SESSIONS_DIR = "sessions";

export class SessionStore {
  public readonly root: string;
  private readonly catalog: SessionCatalog;

  private constructor(root: string, catalog: SessionCatalog) {
    this.root = root;
    this.catalog = catalog;
  }

  public static async open(root = join(getAgentDir(), SESSIONS_DIR)): Promise<SessionStore> {
    const catalog = await SessionCatalog.open(join(root, "catalog.sqlite"));

    try {
      await importLegacySessions({root, catalog, report: (message) => console.warn(`[sessions] ${message}`)});
    } catch (error) {
      catalog.close();
      throw error;
    }

    return new SessionStore(root, catalog);
  }

  public onChange(listener: () => void): () => void {
    return this.catalog.onChange(listener);
  }

  public create(input: {
    readonly id: string;
    readonly projectPath: string;
    readonly worktree?: SessionWorktree;
    readonly forkedFrom?: string;
    readonly title?: string;
  }): SessionRecord {
    if (this.catalog.find(input.id) || existsSync(join(this.root, input.id))) throw new Error("A session with this id already exists.");

    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: input.id,
      projectPath: resolveProjectPath(input.projectPath),
      ...(input.worktree ? {worktree: input.worktree} : {}),
      ...(input.title ? {title: input.title} : {}),
      ...(input.forkedFrom ? {forkedFrom: input.forkedFrom} : {}),
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };

    this.catalog.insert(record);
    return record;
  }

  public find(sessionId: string): SessionRecord | undefined {
    return this.catalog.find(sessionId);
  }

  public list(input: Parameters<SessionCatalog["list"]>[0]): SessionRecord[] {
    return this.catalog.list(input);
  }

  public search(input: Parameters<SessionCatalog["search"]>[0]): SessionRecord[] {
    return this.catalog.search(input);
  }

  public update(sessionId: string, change: (record: SessionRecord) => SessionRecord): SessionRecord {
    return this.catalog.update(sessionId, change);
  }

  public async delete(sessionId: string): Promise<void> {
    await rm(join(this.root, sessionId), {force: true, recursive: true});
    this.catalog.delete(sessionId);
  }

  public close(): void {
    this.catalog.close();
  }
}
