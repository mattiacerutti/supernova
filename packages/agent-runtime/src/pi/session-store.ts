import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import {rm} from "node:fs/promises";
import {join} from "node:path";
import {getAgentDir} from "@earendil-works/pi-coding-agent";
import type {SettingsManager} from "@earendil-works/pi-coding-agent";
import type {EntryRecord} from "@earendil-works/pi-durable";
import type {Session, SessionContextUsage, SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";
import {SessionCatalog} from "@supernova/agent-runtime/pi/lib/session/session-catalog";
import {buildSession, contextUsageOf, publicTurns, timelineEntries} from "@supernova/agent-runtime/pi/lib/session/session-snapshot";
import type {CheckpointRef, SessionRecord, TurnPosition} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {turnPositions} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {PromptedTool} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";
import type {BridgedExtensions} from "@supernova/agent-runtime/pi/lib/tools/extension-bridge";
import {bridgeExtensions} from "@supernova/agent-runtime/pi/lib/tools/extension-bridge";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import type {ConversationSnapshot, SessionFileSetup} from "@supernova/agent-runtime/pi/session-file";
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

/**
 * The histories a session document was built from. Entries are append-only, so while the visible conversation and the
 * leaf stay the same the next build reads only entries after the last one.
 */
export interface SessionHistory {
  readonly visible: number;
  readonly leaf: number;
  readonly entries: readonly EntryRecord[];
  readonly undone: readonly EntryRecord[];
}

/** Where a session's history stands for checkpoint navigation. */
export interface NavigationState {
  /** Every turn of the leaf, undone ones included, in order. */
  readonly turns: readonly TurnPosition[];
  /** How many of `turns` are visible; the rest are undone. */
  readonly visibleCount: number;
  /** The checkpoint the workspace was last captured at or restored to. */
  readonly current: CheckpointRef | undefined;
}

interface OpenSession {
  readonly file: SessionFile;
  readonly extensions: BridgedExtensions;
}

/**
 * Every durable session: one SQLite file each under `<root>/<id>/session.sqlite`, and their records in the catalog at
 * `<root>/catalog.sqlite`, which lists them by project without opening a file. Session files open on first use and
 * stay open until released or disposed; closing one never aborts its work, which resumes when it opens again. The
 * only seam onto the engine: features never import `pi-durable`.
 */
export class SessionStore {
  private readonly root: string;
  private readonly open = new Map<string, Promise<OpenSession>>();
  private readonly settingsCache = new Map<string, SettingsManager>();
  private catalogOpening: Promise<SessionCatalog> | undefined;

  public constructor(private readonly deps: SessionStoreDeps) {
    this.root = deps.root ?? join(getAgentDir(), SESSIONS_DIR);
  }

  /** Records and creates a new session file; the first turn is an ordinary send afterwards. */
  public async create(input: {readonly id: string; readonly projectPath: string; readonly worktree?: SessionWorktree; readonly forkedFrom?: string}): Promise<SessionRecord> {
    const catalog = await this.catalog();
    if (catalog.find(input.id) || existsSync(this.databasePath(input.id))) throw new Error("A session with this id already exists.");

    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: input.id,
      projectPath: input.projectPath,
      ...(input.worktree ? {worktree: input.worktree} : {}),
      ...(input.forkedFrom ? {forkedFrom: input.forkedFrom} : {}),
      createdAt: now,
      updatedAt: now,
    };
    catalog.insert(record);
    try {
      await this.file(input.id);
    } catch (error) {
      await this.delete(input.id);
      throw error;
    }
    return record;
  }

  /** The record of a durable session, or undefined for unknown (or legacy) ids. */
  public async find(sessionId: string): Promise<SessionRecord | undefined> {
    return (await this.catalog()).find(sessionId);
  }

  /** The record of an existing durable session; throws for unknown ids. */
  public async record(sessionId: string): Promise<SessionRecord> {
    const record = await this.find(sessionId);
    if (!record) throw new Error("Session not found.");
    return record;
  }

  /** Every unarchived session of a project, newest first. */
  public async list(projectPath: string): Promise<SessionRecord[]> {
    return (await this.catalog()).list(projectPath);
  }

  /** Applies `change` to an existing record and returns the result. */
  public async update(sessionId: string, change: (record: SessionRecord) => SessionRecord): Promise<SessionRecord> {
    return (await this.catalog()).update(sessionId, change);
  }

  /** The open file of a session, opening it on first use. */
  public async file(sessionId: string): Promise<SessionFile> {
    return (await this.openSession(sessionId)).file;
  }

  /** Whether the session's file is open; a closed session has no work running. */
  public isOpen(sessionId: string): boolean {
    return this.open.has(sessionId);
  }

  /** The working directory a session's agent runs in. */
  public async cwd(sessionId: string): Promise<string> {
    const record = await this.record(sessionId);
    return record.worktree?.path ?? record.projectPath;
  }

  /** Pi's file settings for a working directory, loaded once until `reload()`. */
  public settings(cwd: string): SettingsManager {
    let settings = this.settingsCache.get(cwd);
    if (!settings) {
      settings = this.deps.settings?.(cwd) ?? loadPiSettings(cwd);
      this.settingsCache.set(cwd, settings);
    }
    return settings;
  }

  /**
   * The session document, from the visible conversation's current committed view. Entries are read only
   * up to the view's newest one, so the final answer never shows beside the partial the view still streams.
   * `previous` is the history of the last build, extended instead of read again.
   */
  public async snapshot(sessionId: string, options: {readonly previous?: SessionHistory} = {}): Promise<{readonly session: Session; readonly history: SessionHistory}> {
    const record = await this.record(sessionId);
    const file = await this.file(sessionId);
    const state = await file.state();
    const view = await file.view(state.visible);
    const history = await this.historyOf(file, state, view, options.previous);
    const session = buildSession({
      record,
      entries: history.entries,
      undone: history.undone,
      agent: view.agent,
      live: view.live,
      usage: view.usage,
      runStart: await file.runStart(view.live),
      turns: publicTurns(state.turns),
      context: await this.contextOf(file, view),
    });
    return {session, history};
  }

  /**
   * Forks a session at a visible turn into a new session file with a fresh id: the visible history through the
   * turn's end, its turn records (checkpoints stay keyed by the source, so inherited turns cannot restore files), and
   * the source's model.
   */
  public async fork(input: {readonly sessionId: string; readonly turnId: string}): Promise<string> {
    const source = await this.file(input.sessionId);
    const state = await source.state();
    const history = await source.history(state.visible);
    const turn = turnPositions(history, state.turns).find((candidate) => candidate.turnId === input.turnId);
    if (!turn) throw new Error("This message cannot be forked.");
    const record = await this.record(input.sessionId);
    const id = randomUUID();
    await this.create({id, projectPath: record.projectPath, ...(record.worktree ? {worktree: record.worktree} : {}), forkedFrom: input.sessionId});
    try {
      if (record.title) await this.update(id, (created) => ({...created, title: record.title}));
      const agent = (await source.view(state.visible)).agent;
      const fork = await this.file(id);
      await fork.seed({entries: history.filter((entry) => entry.id <= turn.endId && entry.kind !== "pi.system"), turns: state.turns});
      if (agent?.model) await fork.configure({provider: agent.model.provider, modelId: agent.model.modelId, thinkingLevel: agent.thinkingLevel ?? "off"});
    } catch (error) {
      await this.delete(id);
      throw error;
    }
    return id;
  }

  /** The session's turns and how many are visible, for undo, redo, and revert. */
  public async navigation(sessionId: string): Promise<NavigationState> {
    const file = await this.file(sessionId);
    const state = await file.state();
    const turns = turnPositions(await file.history(state.leaf), state.turns);
    const visibleIds = new Set((await file.history(state.visible)).map((entry) => String(entry.id)));
    return {turns, visibleCount: turns.filter((turn) => visibleIds.has(turn.turnId)).length, current: state.current};
  }

  /**
   * Shows the first `count` turns of the leaf: the leaf itself (all turns), a fork after the last shown turn, or an
   * empty conversation (none). The engine restores the model the conversation had there. `current` records the
   * checkpoint the workspace now matches.
   */
  public async show(sessionId: string, count: number, current: CheckpointRef | undefined): Promise<void> {
    const file = await this.file(sessionId);
    const {turns} = await this.navigation(sessionId);
    await file.navigate(turns[count] === undefined ? "leaf" : turns[count - 1]?.endId, current);
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

  private async historyOf(
    file: SessionFile,
    state: {readonly leaf: number; readonly visible: number},
    view: ConversationSnapshot,
    previous: SessionHistory | undefined
  ): Promise<SessionHistory> {
    const through = view.entries.reduce((newest, entry) => Math.max(newest, entry.id), 0);
    const reuse = previous?.visible === state.visible && previous.leaf === state.leaf;
    const known = reuse ? previous.entries : [];
    const after = known.at(-1)?.id ?? 0;
    const added = through > after ? timelineEntries(await file.history(state.visible, {after, through})) : [];
    const entries = added.length > 0 ? [...known, ...added] : known;
    if (reuse) return {...previous, entries};
    let undone: EntryRecord[] = [];
    if (state.leaf !== state.visible) {
      const visibleIds = new Set((await file.history(state.visible)).map((entry) => entry.id));
      undone = timelineEntries((await file.history(state.leaf)).filter((entry) => !visibleIds.has(entry.id)));
    }
    return {visible: state.visible, leaf: state.leaf, entries, undone};
  }

  private databasePath(sessionId: string): string {
    return join(this.root, sessionId, "session.sqlite");
  }

  private async contextOf(file: SessionFile, view: ConversationSnapshot): Promise<SessionContextUsage> {
    const contextWindow = this.contextWindow(view);
    if (view.entries.length === 0) return {contextWindow, usedTokens: 0};
    const {entries, messages} = await file.modelContext(view.conversationId);
    return contextUsageOf({contextWindow, entries, messages});
  }

  private contextWindow(view: ConversationSnapshot): number {
    const model = view.agent?.model;
    return model ? (this.deps.sdk.modelRuntime.getModel(model.provider, model.modelId)?.contextWindow ?? 0) : 0;
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

  /** Loads a working directory's resources and bridges its extensions into what a session file installs. */
  private async prepare(sessionId: string, cwd: string): Promise<{readonly extensions: BridgedExtensions; readonly setup: SessionFileSetup}> {
    const resources = await this.deps.resourceCache.load(cwd);
    const extensions = bridgeExtensions({
      cwd,
      loaded: resources.extensions,
      modelRuntime: this.deps.sdk.modelRuntime,
      report: ({extensionPath, message}) => this.deps.onReport?.(sessionId, `Extension ${extensionPath} ${message}`),
    });
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
