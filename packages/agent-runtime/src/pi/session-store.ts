import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import {rm} from "node:fs/promises";
import {join} from "node:path";
import {getAgentDir} from "@earendil-works/pi-coding-agent";
import type {SettingsManager} from "@earendil-works/pi-coding-agent";
import type {AgentState, ConversationView, EntryRecord, LiveState, UsageState} from "@earendil-works/pi-durable";
import type {Session, SessionContextUsage, SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";
import {SessionCatalog} from "@supernova/agent-runtime/pi/lib/session/session-catalog";
import {buildSession, contextUsageOf, timelineEntries} from "@supernova/agent-runtime/pi/lib/session/session-snapshot";
import type {CheckpointRef, SessionRecord, TurnPosition} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {turnPositions} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {PromptedTool} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";
import type {BridgedExtensions} from "@supernova/agent-runtime/pi/lib/tools/extension-bridge";
import {bridgeExtensions} from "@supernova/agent-runtime/pi/lib/tools/extension-bridge";
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

/**
 * The branch history a session document was built from. Entries are append-only, so while the branch stays the same
 * the next build reads only entries after the last one.
 */
export interface SessionHistory {
  readonly branch: number;
  readonly entries: readonly EntryRecord[];
}

/** Where a session's history stands for checkpoint navigation. */
export interface NavigationState {
  /** Every turn of the branch, undone ones included, in order. */
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
  // Stores promises to prevent multiple opens of the same file
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
    const record = await this.find(sessionId);
    if (!record) throw new Error("Session not found.");
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
   * The session document, from the branch's current committed view split at the leaf. Entries are read only up to the
   * view's newest one, so the final answer never shows beside the partial the view still streams. `previous` is the
   * history of the last build, extended instead of read again.
   */
  public async snapshot(sessionId: string, options: {readonly previous?: SessionHistory} = {}): Promise<{readonly session: Session; readonly history: SessionHistory}> {
    const record = await this.find(sessionId);
    if (!record) throw new Error("Session not found.");

    const file = await this.file(sessionId);
    const state = await file.state();
    const view = await file.view();
    const history = await this.historyOf(file, state.branch, view, options.previous);
    const {leaf} = state;
    const shown = leaf === undefined ? history.entries : history.entries.filter((entry) => leaf !== null && entry.id <= leaf);
    const live = view.docs["pi.live"] as LiveState | undefined;
    const agent = await file.agent(history.entries);

    const session = buildSession({
      record,
      entries: shown,
      undone: history.entries.slice(shown.length),
      agent,
      live,
      usage: view.docs["pi.usage"] as UsageState | undefined,
      runStart: await file.runStart(live),
      turns: state.turns,
      context: await this.contextOf(file, state.branch, leaf, agent),
    });

    return {session, history};
  }

  /**
   * Forks a session at a shown turn into a new session file with a fresh id: the shown history through the turn's end,
   * its turn records (checkpoints stay keyed by the source, so inherited turns cannot restore files), and the model.
   */
  public async fork(input: {readonly sessionId: string; readonly turnId: string}): Promise<string> {
    const source = await this.file(input.sessionId);
    const state = await source.state();
    const {leaf} = state;
    const history = (await source.history(state.branch)).filter((entry) => leaf === undefined || (leaf !== null && entry.id <= leaf));
    const turn = turnPositions(history, state.turns).find((candidate) => candidate.turnId === input.turnId);
    if (!turn) throw new Error("This message cannot be forked.");
    const record = await this.find(input.sessionId);
    if (!record) throw new Error("Session not found.");
    const id = randomUUID();
    await this.create({id, projectPath: record.projectPath, ...(record.worktree ? {worktree: record.worktree} : {}), forkedFrom: input.sessionId});
    try {
      if (record.title) await this.update(id, (created) => ({...created, title: record.title}));
      const agent = await source.agent();
      const fork = await this.file(id);
      await fork.seed({entries: history.filter((entry) => entry.id <= turn.endId && entry.kind !== "pi.system"), turns: state.turns});
      if (agent?.model) await fork.configure({provider: agent.model.provider, modelId: agent.model.modelId, thinkingLevel: agent.thinkingLevel ?? "off"});
    } catch (error) {
      await this.delete(id);
      throw error;
    }
    return id;
  }

  /**
   * The session's turns and how many are visible, for undo, redo, and revert. `cached` is the history of the last
   * snapshot; its branch's entries are used when it is the current branch, instead of reading them again.
   */
  public async navigation(sessionId: string, cached?: SessionHistory): Promise<NavigationState> {
    const file = await this.file(sessionId);
    const {branch, leaf, current, turns: records} = await file.state();
    const history = cached?.branch === branch ? cached.entries : timelineEntries(await file.history(branch));
    const turns = turnPositions(history, records);
    const visibleCount = leaf === undefined ? turns.length : turns.filter((turn) => leaf !== null && Number(turn.turnId) <= leaf).length;
    return {turns, visibleCount, current};
  }

  /**
   * Shows the first `count` of `turns` (from `navigation()`) by moving the leaf; nothing forks until the agent acts
   * again (see `SessionFile.diverge`). `current` records the checkpoint the workspace now matches.
   */
  public async show(sessionId: string, turns: readonly TurnPosition[], count: number, current: CheckpointRef | undefined): Promise<void> {
    const file = await this.file(sessionId);
    await file.updateState((state) => {
      if (count >= turns.length) delete state.leaf;
      else state.leaf = turns[count - 1]?.endId ?? null;
      if (current) state.current = current;
    });
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

  /** The branch's timeline entries through the view's newest one; extends `previous` while the branch is the same. */
  private async historyOf(file: SessionFile, branch: number, view: ConversationView, previous: SessionHistory | undefined): Promise<SessionHistory> {
    const through = view.entries.reduce((newest, entry) => Math.max(newest, entry.id), 0);
    const cached = previous?.branch === branch ? previous : undefined;
    // A branch forked from the cached one inherits its entries through the fork point.
    const parent = view.conversation.parent;
    const inherited = !cached && parent && previous?.branch === parent.conversationId ? previous.entries.filter((entry) => entry.id <= parent.at) : undefined;
    const known = cached?.entries ?? inherited ?? [];
    const after = known.at(-1)?.id ?? 0;
    if (cached && through <= after) return cached;
    // The view starts at its compaction head, so it extends what is known only when that head is already known.
    const head = view.entries.find((entry) => entry.head !== undefined);
    const extendsCache = (cached ?? inherited) !== undefined && (head === undefined || known.some((entry) => entry.id === head.id));
    const added = timelineEntries(extendsCache ? view.entries.filter((entry) => entry.id > after) : await file.history(branch, {after, through}));
    return {branch, entries: added.length > 0 ? [...known, ...added] : known};
  }

  private databasePath(sessionId: string): string {
    return join(this.root, sessionId, "session.sqlite");
  }

  /** Context usage of the next request from the leaf. */
  private async contextOf(file: SessionFile, branch: number, leaf: number | null | undefined, agent: AgentState | undefined): Promise<SessionContextUsage> {
    const model = agent?.model ? this.deps.sdk.modelRuntime.getModel(agent.model.provider, agent.model.modelId) : undefined;
    const contextWindow = model?.contextWindow ?? 0;
    if (leaf === null) return {contextWindow, usedTokens: 0};
    const {entries, messages} = await file.modelContext(branch, leaf);
    if (entries.length === 0) return {contextWindow, usedTokens: 0};
    return contextUsageOf({contextWindow, entries, messages});
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
