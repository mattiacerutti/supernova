import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import {rm} from "node:fs/promises";
import {join} from "node:path";
import {getAgentDir} from "@earendil-works/pi-coding-agent";
import type {SettingsManager} from "@earendil-works/pi-coding-agent";
import type {SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";
import {SessionCatalog} from "@supernova/agent-runtime/pi/lib/session/session-catalog";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {PromptedTool} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";
import type {LoadedExtensions} from "@supernova/agent-runtime/pi/extensions/extensions";
import {loadExtensions} from "@supernova/agent-runtime/pi/extensions/extensions";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import type {SessionFileSetup} from "@supernova/agent-runtime/pi/session-file";
import {SessionFile} from "@supernova/agent-runtime/pi/session-file";

/** Directory of the durable sessions, beside the old SDK's `sessions/`. */
const SESSIONS_DIR = "sessions-v2";

export interface SessionStoreDeps {
  readonly sdk: Pick<PiSdk, "modelRuntime">;
  readonly resourceCache: Pick<ResourceCache, "load">;
  /** Tools every session offers besides the coding tools; Supernova's own, such as `web_fetch`. */
  readonly tools: () => readonly PromptedTool[];
  /** Defaults to `<agentDir>/sessions-v2`. */
  readonly root?: string;
  /** Defaults to Pi's file settings for the session's working directory. */
  readonly settings?: (cwd: string) => SettingsManager;
  /** Problems that do not fail a command: extension diagnostics and engine reports. */
  readonly onReport?: (sessionId: string, message: string) => void;
}

interface OpenSession {
  readonly file: SessionFile;
  readonly extensions: LoadedExtensions;
}

/**
 * Every durable session: one SQLite file each under `<root>/<id>/session.sqlite`, and their records in the catalog at
 * `<root>/catalog.sqlite`, which lists them by project without opening a file. Session files open on first use and
 * stay open until released or disposed; closing one never aborts its work, which resumes when it opens again. The
 * only seam onto the engine: features never import `pi-durable`.
 */
export class SessionStore {
  private readonly root: string;
  /** Pending opens, so two callers of one id share a single open. */
  private readonly open = new Map<string, Promise<OpenSession>>();
  private readonly settingsCache = new Map<string, SettingsManager>();
  private catalogOpening: Promise<SessionCatalog> | undefined;

  public constructor(private readonly deps: SessionStoreDeps) {
    this.root = deps.root ?? join(getAgentDir(), SESSIONS_DIR);
  }

  /** Records and creates a new session file. */
  public async create(input: {readonly id: string; readonly projectPath: string; readonly worktree?: SessionWorktree; readonly forkedFrom?: string}): Promise<SessionRecord> {
    const catalog = await this.catalog();
    if (catalog.find(input.id) || existsSync(this.databasePath(input.id))) throw new Error("A session with this id already exists.");

    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: input.id,
      projectPath: input.projectPath,
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

  /** The record of a session, or undefined for unknown ids. */
  public async find(sessionId: string): Promise<SessionRecord | undefined> {
    return (await this.catalog()).find(sessionId);
  }

  /** One page of a project's unarchived sessions, pinned first, then newest; see `SessionCatalog.list`. */
  public async list(input: Parameters<SessionCatalog["list"]>[0]): Promise<SessionRecord[]> {
    return (await this.catalog()).list(input);
  }

  /** One page of unarchived sessions whose title matches, newest first; see `SessionCatalog.search`. */
  public async search(input: Parameters<SessionCatalog["search"]>[0]): Promise<SessionRecord[]> {
    return (await this.catalog()).search(input);
  }

  /** Applies `change` to an existing record and returns the result. */
  public async update(sessionId: string, change: (record: SessionRecord) => SessionRecord): Promise<SessionRecord> {
    return (await this.catalog()).update(sessionId, change);
  }

  /** A session's file, opened on first use and kept open until released. */
  public async file(sessionId: string): Promise<SessionFile> {
    return (await this.openSession(sessionId)).file;
  }

  /** The working directory a session's agent runs in. */
  public async cwd(sessionId: string): Promise<string> {
    const record = await this.find(sessionId);
    if (!record) throw new Error("Session not found.");
    return record.worktree?.path ?? record.projectPath;
  }

  /** Pi's file settings for a working directory, loaded once until `reload()`. */
  private settings(cwd: string): SettingsManager {
    let settings = this.settingsCache.get(cwd);
    if (!settings) {
      settings = this.deps.settings?.(cwd) ?? loadPiSettings(cwd);
      this.settingsCache.set(cwd, settings);
    }
    return settings;
  }

  /**
   * Forks a session at a shown turn into a new session file with a fresh id: the shown history through the turn's end,
   * its turn records (checkpoints stay keyed by the source, so inherited turns cannot restore files), and the model.
   */
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

  /** Reinstalls every open session's tools, prompt, and extensions from disk; running work keeps its code. */
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

  /** Closes a session's file. Its work is not aborted; it resumes when the session opens again. */
  public async release(sessionId: string): Promise<void> {
    const pending = this.open.get(sessionId);
    if (!pending) return;
    this.open.delete(sessionId);
    const opened = await pending.catch(() => undefined);
    if (!opened) return;
    await opened.extensions.stop("quit");
    await opened.file.close();
  }

  /** Removes a session's file and record. For undoing a failed create; archiving keeps both. */
  public async delete(sessionId: string): Promise<void> {
    await this.release(sessionId);
    await rm(join(this.root, sessionId), {force: true, recursive: true});
    (await this.catalog()).delete(sessionId);
  }

  /** Closes every open session, then the catalog. */
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
          onReport: (error) => this.deps.onReport?.(sessionId, error instanceof Error ? error.message : String(error)),
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

  /** Loads a working directory's resources and extensions into what a session file installs. */
  private async prepare(sessionId: string, cwd: string): Promise<{readonly extensions: LoadedExtensions; readonly setup: SessionFileSetup}> {
    const resources = await this.deps.resourceCache.load(cwd);
    const extensions = loadExtensions({cwd, resources, modelRuntime: this.deps.sdk.modelRuntime, report: (message) => this.deps.onReport?.(sessionId, message)});

    return {
      extensions,
      setup: {
        cwd,
        modelRuntime: this.deps.sdk.modelRuntime,
        settings: () => this.settings(cwd),
        resources: () => ({contextFiles: resources.contextFiles, skills: resources.skills}),
        extraTools: () => [...this.deps.tools(), ...extensions.tools],
        extensions: () => extensions.extensions,
      },
    };
  }

  /** The catalog, opened on first use; a failed open is retried by the next call. */
  private catalog(): Promise<SessionCatalog> {
    this.catalogOpening ??= SessionCatalog.open(join(this.root, "catalog.sqlite")).catch((error: unknown) => {
      this.catalogOpening = undefined;
      throw error;
    });
    return this.catalogOpening;
  }
}
