import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import {rm} from "node:fs/promises";
import {join} from "node:path";
import {getAgentDir} from "@earendil-works/pi-coding-agent";
import type {SettingsManager} from "@earendil-works/pi-coding-agent";
import type {SessionNotice} from "@supernova/contracts/services/session-runtime/procedures";
import type {SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import {resolveProjectPath} from "@supernova/agent-runtime/lib/project-path";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";
import {SessionCatalog} from "@supernova/agent-runtime/pi/lib/session/session-catalog";
import {importLegacySessions} from "@supernova/agent-runtime/pi/lib/session/legacy/legacy-sessions";
import type {SessionExtension} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {LoadedExtensions} from "@supernova/agent-runtime/pi/extensions/extensions";
import {loadExtensions} from "@supernova/agent-runtime/pi/extensions/extensions";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import type {SessionFileSetup} from "@supernova/agent-runtime/pi/session-file";
import {SessionFile} from "@supernova/agent-runtime/pi/session-file";

/** Directory of the sessions: the old SDK's, which hold its project folders until they are imported (see `legacy/`). */
const SESSIONS_DIR = "sessions";

export interface SessionStoreDeps {
  readonly sdk: Pick<PiSdk, "modelRuntime">;
  readonly resourceCache: Pick<ResourceCache, "load">;
  readonly extensions: readonly SessionExtension[];
  readonly root?: string;
  readonly settings?: (cwd: string) => SettingsManager;
  readonly onReport?: (sessionId: string, notice: Pick<SessionNotice, "message" | "extensionPath" | "extensionName">) => void;
}

interface OpenSession {
  readonly file: SessionFile;
  readonly extensions: LoadedExtensions;
}

/**
 * Closing a file never aborts its work; it resumes when the session opens again. The only seam onto the engine:
 * features never import `pi-durable`.
 */
export class SessionStore {
  private readonly root: string;
  private readonly open = new Map<string, Promise<OpenSession>>();
  private readonly settingsCache = new Map<string, SettingsManager>();
  private catalogOpening: Promise<SessionCatalog> | undefined;

  public constructor(private readonly deps: SessionStoreDeps) {
    this.root = deps.root ?? join(getAgentDir(), SESSIONS_DIR);
  }

  public async create(input: {readonly id: string; readonly projectPath: string; readonly worktree?: SessionWorktree; readonly forkedFrom?: string}): Promise<SessionRecord> {
    const catalog = await this.catalog();
    // Any entry under the root is taken: an existing session, the catalog, or the imported old sessions' folder.
    if (catalog.find(input.id) || existsSync(join(this.root, input.id))) throw new Error("A session with this id already exists.");

    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: input.id,
      projectPath: resolveProjectPath(input.projectPath),
      ...(input.worktree ? {worktree: input.worktree} : {}),
      ...(input.forkedFrom ? {forkedFrom: input.forkedFrom} : {}),
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    catalog.insert(record);

    try {
      await this.openSession(input.id);
    } catch (error) {
      await this.delete(input.id);
      throw error;
    }

    return record;
  }

  public async find(sessionId: string): Promise<SessionRecord | undefined> {
    return (await this.catalog()).find(sessionId);
  }

  public async list(input: Parameters<SessionCatalog["list"]>[0]): Promise<SessionRecord[]> {
    return (await this.catalog()).list(input);
  }

  public async search(input: Parameters<SessionCatalog["search"]>[0]): Promise<SessionRecord[]> {
    return (await this.catalog()).search(input);
  }

  public async update(sessionId: string, change: (record: SessionRecord) => SessionRecord): Promise<SessionRecord> {
    return (await this.catalog()).update(sessionId, change);
  }

  public async file(sessionId: string): Promise<SessionFile> {
    return (await this.openSession(sessionId)).file;
  }

  public async cwd(sessionId: string): Promise<string> {
    const record = await this.find(sessionId);
    if (!record) throw new Error("Session not found.");
    return record.worktree?.path ?? record.projectPath;
  }

  private settings(cwd: string): SettingsManager {
    let settings = this.settingsCache.get(cwd);
    if (!settings) {
      settings = this.deps.settings?.(cwd) ?? loadPiSettings(cwd);
      this.settingsCache.set(cwd, settings);
    }
    return settings;
  }

  /** Checkpoints stay keyed by the source, so inherited turns cannot restore files. */
  public async fork(input: {readonly sessionId: string; readonly turnId: string}): Promise<string> {
    const record = await this.find(input.sessionId);
    if (!record) throw new Error("Session not found.");
    const source = await this.file(input.sessionId);
    const id = randomUUID();
    await this.create({id, projectPath: record.projectPath, ...(record.worktree ? {worktree: record.worktree} : {}), forkedFrom: input.sessionId});
    try {
      if (record.title) await this.update(id, (created) => ({...created, title: record.title}));
      await (await this.file(id)).copyFrom(source, input.turnId);
    } catch (error) {
      await this.delete(id);
      throw error;
    }
    return id;
  }

  public async reload(): Promise<void> {
    this.settingsCache.clear();
    await Promise.all(
      [...this.open.entries()].map(async ([sessionId, pending]) => {
        const opened = await pending.catch(() => undefined);
        if (!opened) return;
        await opened.extensions.stop("reload");
        const {extensions, setup} = await this.prepare(sessionId, opened.file.cwd);
        opened.file.install(setup);
        this.open.set(sessionId, Promise.resolve({file: opened.file, extensions}));
        await extensions.start();
      })
    );
  }

  public async release(sessionId: string): Promise<void> {
    const pending = this.open.get(sessionId);
    if (!pending) return;
    this.open.delete(sessionId);
    const opened = await pending.catch(() => undefined);
    if (!opened) return;
    await opened.extensions.stop("quit");
    await opened.file.close();
  }

  public async delete(sessionId: string): Promise<void> {
    await this.release(sessionId);
    await rm(join(this.root, sessionId), {force: true, recursive: true});
    (await this.catalog()).delete(sessionId);
  }

  public async dispose(): Promise<void> {
    await Promise.all([...this.open.keys()].map((sessionId) => this.release(sessionId)));
    const catalog = await this.catalogOpening?.catch(() => undefined);
    this.catalogOpening = undefined;
    catalog?.close();
  }

  private databasePath(sessionId: string): string {
    return join(this.root, sessionId, "session.sqlite");
  }

  private openSession(sessionId: string): Promise<OpenSession> {
    let pending = this.open.get(sessionId);
    if (!pending) {
      pending = (async () => {
        const {extensions, setup} = await this.prepare(sessionId, await this.cwd(sessionId));
        const file = await SessionFile.open({
          ...setup,
          sessionId,
          path: this.databasePath(sessionId),
          onReport: (error) => this.deps.onReport?.(sessionId, {message: error instanceof Error ? error.message : String(error)}),
        });
        await extensions.start();
        return {file, extensions};
      })().catch((error) => {
        this.open.delete(sessionId);
        throw error;
      });
      this.open.set(sessionId, pending);
    }
    return pending;
  }

  private async prepare(sessionId: string, cwd: string): Promise<{readonly extensions: LoadedExtensions; readonly setup: SessionFileSetup}> {
    const resources = await this.deps.resourceCache.load(cwd);
    const extensions = loadExtensions({cwd, resources, modelRuntime: this.deps.sdk.modelRuntime, report: (notice) => this.deps.onReport?.(sessionId, notice)});

    return {
      extensions,
      setup: {
        cwd,
        modelRuntime: this.deps.sdk.modelRuntime,
        settings: () => this.settings(cwd),
        resources: () => ({contextFiles: resources.contextFiles, skills: resources.skills}),
        extensions: () => [...this.deps.extensions, ...extensions.extensions],
      },
    };
  }

  private catalog(): Promise<SessionCatalog> {
    this.catalogOpening ??= (async () => {
      const catalog = await SessionCatalog.open(join(this.root, "catalog.sqlite"));
      try {
        await importLegacySessions({root: this.root, catalog, report: (message) => console.warn(`[sessions] ${message}`)});
      } catch (error) {
        catalog.close();
        throw error;
      }
      return catalog;
    })().catch((error: unknown) => {
      this.catalogOpening = undefined;
      throw error;
    });
    return this.catalogOpening;
  }
}
