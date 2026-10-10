import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {ImageContent, TextContent} from "@earendil-works/pi-ai";
import type {ModelRuntime, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {
  AgentState,
  CompactionResult,
  Conversation,
  ConversationId,
  ConversationView,
  EntryId,
  EntryRecord,
  Extension,
  Harness,
  LiveState,
  Registry,
  UsageState,
} from "@earendil-works/pi-durable";
import {AgentDoc, ConversationBusy, createRegistry, defineExtension, Harness as HarnessFactory, ROOT_CONVERSATION_ID} from "@earendil-works/pi-durable";
import type {Session, SessionContextUsage} from "@supernova/contracts/services/sessions/schemas";
import {NodeExecutionEnv} from "@earendil-works/pi-durable/env/node";
import {openNodeSqliteStorage} from "@earendil-works/pi-durable/storage/sqlite/node";
import {harnessModels, harnessSettings} from "@supernova/agent-runtime/pi/config/harness-settings";
import type {PromptResources} from "@supernova/agent-runtime/pi/config/system-prompt";
import {createPromptSections} from "@supernova/agent-runtime/pi/config/system-prompt";
import {buildSession, contextUsageOf, timelineEntries} from "@supernova/agent-runtime/pi/lib/session/session-snapshot";
import type {CheckpointRef, SessionRecord, SessionState, TurnPosition, TurnRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {SessionStateDoc, turnPositions} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {PromptedTool} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";
import {createCodingTools} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";

const context = BACKGROUND_CONTEXT;

/** What a session file installs: its tools, prompt, and extensions, read again on reload. */
export interface SessionFileSetup {
  /** The agent's working directory: the project, or the session's worktree. */
  readonly cwd: string;
  readonly modelRuntime: ModelRuntime;
  readonly settings: () => SettingsManager;
  readonly resources: () => PromptResources;
  /** Tools beyond the coding tools: Supernova's own and the extensions'. */
  readonly extraTools: () => readonly PromptedTool[];
  /** Engine extensions bridged from Pi extension packages. */
  readonly extensions: () => readonly Extension[];
}

/** The model and thinking level a send or compaction runs with. */
export interface SessionModel {
  readonly provider: string;
  readonly modelId: string;
  readonly thinkingLevel: string;
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

export class SessionBusyError extends Error {
  public constructor() {
    super("Session already has active work.");
  }
}

/** Document values are strict JSON; records may carry undefined optional fields, which this drops. */
function strictJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * One open session: a Harness over its SQLite file, the extensions installed in it, and its `supernova.session` state.
 * The chat starts as the root conversation, the first branch. Undo, redo, and revert only move the state's `leaf`; the
 * next send or compaction from an undone leaf forks the branch there, which becomes the new branch.
 */
export class SessionFile {
  private readonly listeners = new Set<() => void>();
  private followed: {readonly branch: number; readonly stop: () => void} | undefined;
  /** The branch's timeline entries, read once and extended; see `branchHistory`. */
  private cache: {readonly branch: number; readonly entries: readonly EntryRecord[]} | undefined;

  private constructor(
    public readonly sessionId: string,
    public readonly cwd: string,
    private readonly modelRuntime: ModelRuntime,
    /** Pi's file settings for the session's working directory. */
    public readonly settings: () => SettingsManager,
    private readonly harness: Harness,
    private readonly registry: Registry,
    private readonly env: NodeExecutionEnv
  ) {}

  /** Opens (creating when absent) a session file and resumes work the last process left unfinished. */
  public static async open(input: SessionFileSetup & {readonly sessionId: string; readonly path: string; readonly onReport: (error: unknown) => void}): Promise<SessionFile> {
    const shellPath = input.settings().getShellPath();
    const env = new NodeExecutionEnv({cwd: input.cwd, shellPath});

    const registry = createRegistry();
    const harness = await HarnessFactory.open(
      await openNodeSqliteStorage(input.path),
      {
        models: harnessModels({modelRuntime: input.modelRuntime, settings: input.settings}),
        registry,
        settings: harnessSettings(input.settings),
        // One environment: every conversation of a session runs in its working directory.
        env: () => env,
        onReport: input.onReport,
      },
      context
    );

    const file = new SessionFile(input.sessionId, input.cwd, input.modelRuntime, input.settings, harness, registry, env);
    file.install(input);

    await harness.root(context, {agent: {cwd: input.cwd}});
    await file.follow((await file.state()).branch);
    harness.resume();

    return file;
  }

  /**
   * Installs the tools, prompt, and extensions. A same-named install replaces in place, so this is also the reload
   * path: running work finishes on the code it took.
   */
  public install(setup: SessionFileSetup): void {
    const codingTools = createCodingTools({cwd: setup.cwd, settings: setup.settings()});
    const tools = [...codingTools, ...setup.extraTools()];
    const prompts = new Map(tools.map(({tool, prompt}) => [tool.name, prompt]));

    const extensions = [
      defineExtension({name: "tools", tools: tools.map(({tool}) => tool)}),
      defineExtension({name: "prompt", sections: createPromptSections({cwd: setup.cwd, resources: setup.resources, toolPrompts: prompts})}),
      ...setup.extensions(),
    ];

    for (const extension of extensions) this.registry.install(extension);
    const names = new Set(extensions.map((extension) => extension.name));

    for (const extension of this.registry.snapshot().installed()) {
      if (!names.has(extension.name)) this.registry.uninstall(extension);
    }
  }

  /** The session document, rebuilt from the branch's committed view split at the leaf. See `SessionSnapshot`. */
  public async snapshot(record: SessionRecord): Promise<Session> {
    const state = await this.state();
    const view = await this.view(state.branch);
    const history = await this.branchHistory(state.branch, view);
    const {leaf} = state;
    const shown = leaf === undefined ? history : history.filter((entry) => leaf !== null && entry.id <= leaf);
    const live = view.docs["pi.live"] as LiveState | undefined;
    const agent = await this.agentAt(state, history);
    return buildSession({
      record,
      entries: shown,
      undone: history.slice(shown.length),
      agent,
      live,
      usage: view.docs["pi.usage"] as UsageState | undefined,
      runStart: await this.runStart(live),
      turns: state.turns,
      context: await this.contextUsage(state, agent),
    });
  }

  /** Whether the branch has a run in progress. */
  public async isRunning(): Promise<boolean> {
    return (await this.view((await this.state()).branch)).docs["pi.live"]?.run !== undefined;
  }

  /** The branch's turns, undone ones included, and how many are shown, for undo, redo, and revert. */
  public async navigation(): Promise<NavigationState> {
    const state = await this.state();
    const turns = turnPositions(await this.branchHistory(state.branch), state.turns);
    const {leaf} = state;
    const visibleCount = leaf === undefined ? turns.length : turns.filter((turn) => leaf !== null && Number(turn.turnId) <= leaf).length;
    return {turns, visibleCount, current: state.current};
  }

  /**
   * Shows the first `count` of `turns` (from `navigation()`) by moving the leaf; nothing forks until the agent acts
   * again. `current` records the checkpoint the workspace now matches.
   */
  public async show(turns: readonly TurnPosition[], count: number, current: CheckpointRef | undefined): Promise<void> {
    await this.updateState((state) => {
      if (count >= turns.length) delete state.leaf;
      else state.leaf = turns[count - 1]?.endId ?? null;
      if (current) state.current = current;
    });
  }

  /**
   * Submits a user input with the given model and records its turn under the placed user entry. From an undone leaf,
   * forks there first, which drops the undone turns. Rejects with `SessionBusyError` while a run is active. Resolves
   * with a wait for the input's settlement.
   *
   * TODO(queue): with `whenBusy: "steer" | "followUp"` the engine places the input later, at a turn boundary; its
   * turn record (and before-turn checkpoint) must then be written when it is placed, not here.
   */
  public async send(input: {readonly content: string | (TextContent | ImageContent)[]; readonly record: TurnRecord; readonly model: SessionModel}) {
    const branch = await this.prepareBranch(input.model);
    let submission;
    try {
      submission = await branch.submit({type: "input", content: input.content, whenBusy: "reject"}, context);
    } catch (error) {
      throw error instanceof ConversationBusy ? new SessionBusyError() : error;
    }
    const placed = await submission.status(context);
    if (placed.type !== "input" || placed.entry === undefined) throw new Error("The message was not placed.");
    const entryId = placed.entry;
    await this.updateState((state) => {
      state.turns[String(entryId)] = strictJson(input.record);
      state.current = input.record.before;
    });
    return {wait: async (): Promise<{readonly status: string; readonly reason?: string; readonly detail?: unknown}> => submission.wait(context)};
  }

  /** Compacts with the given model; from an undone leaf, forks there first. Resolves once the summary is placed. */
  public async compact(model: SessionModel): Promise<void> {
    const taskId = await (await this.prepareBranch(model)).compact(undefined, context);
    const {outcome} = (await this.harness.waitForTask(taskId, context)).state;
    if (outcome.status === "aborted") return;
    if (outcome.status !== "completed") throw new Error(outcome.error?.message ?? `Compaction ${outcome.status}.`);
    const {submissionId} = outcome.result as CompactionResult;
    if (submissionId !== undefined) await (await this.harness.submission(submissionId, context))?.wait(context);
  }

  /** Aborts the branch's work and resolves once it is idle. */
  public async abort(): Promise<void> {
    await (await this.conversation((await this.state()).branch)).abort(context);
  }

  /** Every turn record, keyed by its user entry id: authored content and checkpoints. */
  public async turnRecords(): Promise<Readonly<Record<string, TurnRecord>>> {
    return (await this.state()).turns;
  }

  /** Turns whose run ended but that have no after-turn checkpoint yet, and whether any of them captures. */
  public async unsettledTurns(): Promise<{readonly turnIds: readonly string[]; readonly capture: boolean}> {
    const open = Object.entries((await this.state()).turns).filter(([, record]) => record.after === undefined);
    return {turnIds: open.map(([turnId]) => turnId), capture: open.some(([, record]) => record.capture)};
  }

  /** Records `after` as the after-turn checkpoint of `turnIds` (disabled for turns that do not capture). */
  public async settleTurns(turnIds: readonly string[], after: CheckpointRef): Promise<void> {
    await this.updateState((state) => {
      for (const turnId of turnIds) {
        const record = state.turns[turnId];
        if (record) state.turns[turnId] = {...record, after: record.capture ? after : {...after, status: "disabled"}};
      }
      state.current = after;
    });
  }

  /**
   * Copies `source`'s shown history through turn `turnId` into this empty session, for forking across session files:
   * entries go to the root conversation in one commit with their kind, model messages, data, and head; turn records
   * follow their remapped user entries; the source's model and thinking level carry over.
   */
  public async copyFrom(source: SessionFile, turnId: string): Promise<void> {
    const state = await source.state();
    const {leaf} = state;
    const history = (await source.history(state.branch)).filter((entry) => leaf === undefined || (leaf !== null && entry.id <= leaf));
    const turn = turnPositions(history, state.turns).find((candidate) => candidate.turnId === turnId);
    if (!turn) throw new Error("This message cannot be forked.");
    const agent = await source.agentAt(state, history);

    const root = await this.conversation(ROOT_CONVERSATION_ID);
    const ids = new Map<number, number>();
    await root.commit(async (tx) => {
      const turns: Record<string, TurnRecord> = {};
      for (const entry of history) {
        if (entry.id > turn.endId || entry.kind === "pi.system") continue;
        const head = entry.head === undefined ? undefined : entry.head === entry.id ? "self" : ids.get(entry.head);
        const copied = await tx.appendEntry(root.id, {
          kind: entry.kind,
          ...(entry.model ? {model: entry.model} : {}),
          ...(entry.data === undefined ? {} : {data: entry.data}),
          ...(head === undefined ? {} : {head: head as EntryId | "self"}),
        });
        ids.set(entry.id, copied.id);
        const record = state.turns[String(entry.id)];
        if (record) turns[String(copied.id)] = record;
      }
      Object.assign(((await tx.doc(SessionStateDoc)) as unknown as SessionState).turns, turns);
    }, context);
    if (agent?.model) await this.configure(root, {provider: agent.model.provider, modelId: agent.model.modelId, thinkingLevel: agent.thinkingLevel ?? "off"});
  }

  /**
   * Calls `listener` on every committed change of the branch, following the branch when a send or compaction forks a
   * new one. Returns the unsubscribe.
   */
  public watch(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Closes the Harness. Running work is not aborted; it resumes when the session opens again. */
  public async close(): Promise<void> {
    this.followed?.stop();
    this.followed = undefined;
    await this.harness.close(context);
    await this.env.cleanup(context);
  }

  /** The `supernova.session` state; its initial value until the first write. */
  private async state(): Promise<SessionState> {
    const state = (await this.harness.snapshot(SessionStateDoc, context)) as SessionState | undefined;
    return state ?? (SessionStateDoc.definition.initial() as SessionState);
  }

  /** Changes the `supernova.session` state in one commit. */
  private async updateState(change: (state: SessionState) => void): Promise<void> {
    await this.harness.commit(async (tx) => {
      change((await tx.doc(SessionStateDoc)) as unknown as SessionState);
    }, context);
  }

  private async view(conversationId: number): Promise<ConversationView> {
    const state = await (await this.conversation(conversationId)).viewState(context);
    try {
      return state.value!;
    } finally {
      state.dispose();
    }
  }

  /**
   * A conversation's history in append order, inherited fork history and compacted entries included. `after` and
   * `through` bound the entry ids, for reading only what the cache lacks.
   */
  private async history(conversationId: number, range: {readonly after?: number; readonly through?: number} = {}): Promise<EntryRecord[]> {
    const conversation = await this.conversation(conversationId);
    const query = {
      ...(range.after === undefined ? {} : {minEntryId: (range.after + 1) as EntryId}),
      ...(range.through === undefined ? {} : {maxEntryId: range.through as EntryId}),
    };
    const items: EntryRecord[] = [];
    let cursor;
    do {
      const page = await conversation.entries(query, 256, cursor, context);
      items.push(...page.items);
      cursor = page.next;
    } while (cursor !== undefined);
    return items.reverse();
  }

  /**
   * The branch's timeline entries (no `pi.system`), through `view`'s newest one when given. Cached: entries are
   * append-only, so a later call reads only entries after the cached ones, and a branch forked from the cached one
   * reuses its entries through the fork point. Navigation reads nothing.
   */
  private async branchHistory(branch: number, view?: ConversationView): Promise<readonly EntryRecord[]> {
    const cached = this.cache?.branch === branch ? this.cache.entries : undefined;
    if (!view) {
      if (cached) return cached;
      view = await this.view(branch);
    }
    const through = view.entries.reduce((newest, entry) => Math.max(newest, entry.id), 0);
    const parent = view.conversation.parent;
    const inherited = !cached && parent && this.cache?.branch === parent.conversationId ? this.cache.entries.filter((entry) => entry.id <= parent.at) : undefined;
    const known = cached ?? inherited ?? [];
    const after = known.at(-1)?.id ?? 0;
    if (cached && through <= after) return cached;
    // The view starts at its compaction head, so it extends what is known only when that head is already known.
    const head = view.entries.find((entry) => entry.head !== undefined);
    const extendsKnown = (cached ?? inherited) !== undefined && (head === undefined || known.some((entry) => entry.id === head.id));
    const added = timelineEntries(extendsKnown ? view.entries.filter((entry) => entry.id > after) : await this.history(branch, {after, through}));
    const entries = added.length > 0 ? [...known, ...added] : known;
    this.cache = {branch, entries};
    return entries;
  }

  /** The agent (model, thinking level) the next send starts from: the branch's as of the leaf. */
  private async agentAt(state: SessionState, history: readonly EntryRecord[]): Promise<AgentState | undefined> {
    const {branch, leaf} = state;
    if (leaf === undefined) return (await this.view(branch)).docs["pi.agent"] as AgentState | undefined;
    const at = leaf ?? history[0]?.id;
    return at === undefined ? undefined : this.harness.snapshotAsOf(AgentDoc, branch as ConversationId, at as EntryId, context);
  }

  /** Context usage of the next request from the leaf. */
  private async contextUsage(state: SessionState, agent: AgentState | undefined): Promise<SessionContextUsage> {
    const model = agent?.model ? this.modelRuntime.getModel(agent.model.provider, agent.model.modelId) : undefined;
    const contextWindow = model?.contextWindow ?? 0;
    if (state.leaf === null) return {contextWindow, usedTokens: 0};
    const {entries, messages} = await (await this.conversation(state.branch)).context(context, {at: state.leaf as EntryId});
    if (entries.length === 0) return {contextWindow, usedTokens: 0};
    return contextUsageOf({contextWindow, entries, messages});
  }

  /** The first user entry of the active run, or undefined when idle. */
  private async runStart(live: LiveState | undefined): Promise<number | undefined> {
    const entries: number[] = [];
    for (const id of live?.run?.inputs ?? []) {
      const record = await (await this.harness.submission(id, context))?.status(context);
      if (record?.type === "input" && record.entry !== undefined) entries.push(record.entry);
    }
    return entries.length > 0 ? Math.min(...entries) : undefined;
  }

  /**
   * The branch the agent acts on next, configured with `model`. From an undone leaf it is a new fork of the branch
   * there (or an empty conversation when nothing is shown), which drops the undone turns; the watch follows it.
   */
  private async prepareBranch(model: SessionModel): Promise<Conversation> {
    const {branch, leaf} = await this.state();
    let conversation = await this.conversation(branch);
    if (leaf !== undefined) {
      conversation =
        leaf === null
          ? await this.harness.createConversation({ownership: {kind: "ownerless"}, agent: {cwd: this.cwd}}, context)
          : await conversation.fork(leaf as EntryId, {ownership: {kind: "ownerless"}}, context);
      await this.updateState((state) => {
        state.branch = conversation.id;
        delete state.leaf;
      });
      await this.follow(conversation.id);
    }
    await this.configure(conversation, model);
    return conversation;
  }

  private async configure(conversation: Conversation, model: SessionModel): Promise<void> {
    await conversation.configure(
      {model: {provider: model.provider, modelId: model.modelId}, thinkingLevel: model.thinkingLevel as NonNullable<AgentState["thinkingLevel"]>},
      context
    );
  }

  /** Moves the engine watch to `branch`; listeners are notified of its frames. */
  private async follow(branch: number): Promise<void> {
    if (this.followed?.branch === branch) return;
    const state = await (await this.conversation(branch)).viewState(context);
    const unsubscribe = state.subscribe(() => {
      for (const listener of this.listeners) listener();
    });
    this.followed?.stop();
    this.followed = {
      branch,
      stop: () => {
        unsubscribe();
        state.dispose();
      },
    };
    for (const listener of this.listeners) listener();
  }

  private async conversation(id: number): Promise<Conversation> {
    const conversation = await this.harness.conversation(id as ConversationId, context);
    if (!conversation) throw new Error(`Conversation ${id} of session ${this.sessionId} does not exist.`);
    return conversation;
  }
}
