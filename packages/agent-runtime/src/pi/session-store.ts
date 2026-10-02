import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import {mkdir, readFile, rename, rm, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {getAgentDir} from "@earendil-works/pi-coding-agent";
import type {SettingsManager} from "@earendil-works/pi-coding-agent";
import type {Session, SessionContextUsage, SessionWorktree, Turn} from "@supernova/contracts/sessions/schemas";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";
import {buildSession, contextUsageOf, modelReferenceOf, turnsOf} from "@supernova/agent-runtime/pi/lib/session/session-snapshot";
import type {CheckpointRef, SessionRecord, TurnPosition} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {turnPositions} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {PromptedTool} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";
import type {BridgedExtensions} from "@supernova/agent-runtime/pi/lib/tools/extension-bridge";
import {bridgeExtensions} from "@supernova/agent-runtime/pi/lib/tools/extension-bridge";
import {buildLiveTurn} from "@supernova/agent-runtime/pi/lib/turns/live-turn";
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

/** The running turn of a session and its context, built from one committed view. */
export interface LiveSnapshot {
  readonly busy: boolean;
  readonly compacting: boolean;
  readonly turn: Turn | undefined;
  readonly context: SessionContextUsage;
  /** The run's first user entry, or the settled run's when building it after it ended. */
  readonly runStart: number | undefined;
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

interface IndexFile {
  readonly version: 1;
  readonly sessions: Record<string, SessionRecord>;
}

/**
 * Every durable session: one SQLite file each under `<root>/<id>/session.sqlite`, and the index at
 * `<root>/index.json` that lists them by project without opening a file (the engine cannot list by project). Session
 * files open on first use and stay open until released or disposed; closing one never aborts its work, which resumes
 * when it opens again. The only seam onto the engine: features never import `pi-durable`.
 *
 * The index is held in memory and rewritten atomically on change; a few thousand sessions are a few hundred KB.
 * Revisit with SQLite if that grows.
 */
export class SessionStore {
  private readonly root: string;
  private readonly open = new Map<string, Promise<OpenSession>>();
  private readonly settingsCache = new Map<string, SettingsManager>();
  private records: Map<string, SessionRecord> | undefined;
  private writing: Promise<void> = Promise.resolve();

  public constructor(private readonly deps: SessionStoreDeps) {
    this.root = deps.root ?? join(getAgentDir(), SESSIONS_DIR);
  }

  /** Records and creates a new session file; the first turn is an ordinary send afterwards. */
  public async create(input: {readonly id: string; readonly projectPath: string; readonly worktree?: SessionWorktree; readonly forkedFrom?: string}): Promise<SessionRecord> {
    const records = await this.load();
    if (records.has(input.id) || existsSync(this.databasePath(input.id))) throw new Error("A session with this id already exists.");
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: input.id,
      projectPath: input.projectPath,
      ...(input.worktree ? {worktree: input.worktree} : {}),
      ...(input.forkedFrom ? {forkedFrom: input.forkedFrom} : {}),
      createdAt: now,
      updatedAt: now,
    };
    records.set(record.id, record);
    await this.persist();
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
    return (await this.load()).get(sessionId);
  }

  /** The record of an existing durable session; throws for unknown ids. */
  public async record(sessionId: string): Promise<SessionRecord> {
    const record = await this.find(sessionId);
    if (!record) throw new Error("Session not found.");
    return record;
  }

  /** Every unarchived session of a project, newest first. */
  public async list(projectPath: string): Promise<SessionRecord[]> {
    return [...(await this.load()).values()]
      .filter((record) => record.projectPath === projectPath && record.archivedAt === undefined)
      .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  /** Applies `change` to an existing record and returns the result. */
  public async update(sessionId: string, change: (record: SessionRecord) => SessionRecord): Promise<SessionRecord> {
    const next = change(await this.record(sessionId));
    (await this.load()).set(sessionId, next);
    await this.persist();
    return next;
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
   * The committed session: the visible history with undone turns. Entries of the active run are left out; they
   * belong to the live turn until it settles. `before` leaves out entries from that id on regardless, for a run the
   * engine ended whose settled snapshot is not published yet.
   */
  public async snapshot(sessionId: string, options?: {readonly before?: number}): Promise<Session> {
    const record = await this.record(sessionId);
    const file = await this.file(sessionId);
    const state = await file.state();
    const view = await file.view(state.visible);
    const modelReference = modelReferenceOf(view.agent);
    const runStart = (await file.runStart(view.live)) ?? options?.before;
    const history = (await file.history(state.visible)).filter((entry) => runStart === undefined || entry.id < runStart);
    const turns = modelReference ? turnsOf(history, state.turns, modelReference) : [];

    let undoneTurns: Turn[] = [];
    if (state.leaf !== state.visible && modelReference) {
      const visibleIds = new Set(history.map((entry) => entry.id));
      const undone = (await file.history(state.leaf)).filter((entry) => !visibleIds.has(entry.id));
      undoneTurns = turnsOf(undone, state.turns, modelReference).filter((turn) => state.turns[turn.id] !== undefined);
    }

    // Usage is not frozen while a run changes the context; the committed read reports it as not yet known.
    const context = runStart === undefined ? await this.contextOf(file, view) : {contextWindow: this.contextWindow(view), usedTokens: null};
    return buildSession({context, modelReference, record, turns, undoneTurns});
  }

  /**
   * The running turn of a session, built from one committed view. `settledRunStart` builds the turn of a run that
   * already ended: the engine commits a final answer together with the run's end, so no live frame shows it.
   */
  public async live(sessionId: string, view: ConversationSnapshot, settledRunStart?: number): Promise<LiveSnapshot> {
    const file = await this.file(sessionId);
    const modelReference = modelReferenceOf(view.agent);
    const runStart = (await file.runStart(view.live)) ?? settledRunStart;
    const busy = view.live?.run !== undefined;
    const compacting = (view.live?.compactions ?? []).some((compaction) => compaction.blocking);
    const context = await this.contextOf(file, view);
    // Frames are handled after they were committed, so the history may already be ahead of this frame (for example
    // with the final answer whose partial the frame still streams). Read it only up to the frame's last entry; a
    // frame from before the run's input has no turn of it.
    const frameEnd = view.entries.at(-1)?.id;
    if (runStart === undefined || !modelReference || frameEnd === undefined || frameEnd < runStart) return {busy, compacting, turn: undefined, context, runStart};
    const runEntries = (await file.history(view.conversationId)).filter((entry) => entry.id >= runStart && entry.id <= frameEnd);
    const turn = buildLiveTurn({live: view.live, modelReference, runEntries, runStart, turns: (await file.state()).turns});
    return {busy, compacting, turn, context, runStart};
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
    if ((await this.load()).delete(sessionId)) await this.persist();
  }

  /** Closes every open session. */
  public async dispose(): Promise<void> {
    await Promise.all([...this.open.keys()].map((sessionId) => this.release(sessionId)));
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

  private async load(): Promise<Map<string, SessionRecord>> {
    if (this.records) return this.records;
    const path = join(this.root, "index.json");
    let file: IndexFile | undefined;
    try {
      file = JSON.parse(await readFile(path, "utf8")) as IndexFile;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`Could not read the session index at ${path}.`, {cause});
    }
    this.records ??= new Map(Object.entries(file?.sessions ?? {}));
    return this.records;
  }

  /** Rewrites the index atomically; writes are serialized. */
  private persist(): Promise<void> {
    const write = async () => {
      const path = join(this.root, "index.json");
      const file: IndexFile = {version: 1, sessions: Object.fromEntries(this.records ?? [])};
      await mkdir(dirname(path), {recursive: true});
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(file)}\n`);
      await rename(temporary, path);
    };
    this.writing = this.writing.then(write, write);
    return this.writing;
  }
}
