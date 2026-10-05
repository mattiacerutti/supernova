import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {ImageContent, TextContent} from "@earendil-works/pi-ai";
import type {ModelRuntime, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {
  AgentState,
  CompactionResult,
  ContextView,
  Conversation,
  ConversationId,
  ConversationView,
  EntryId,
  EntryRecord,
  Extension,
  Harness,
  LiveState,
  Registry,
} from "@earendil-works/pi-durable";
import {AgentDoc, ConversationBusy, createRegistry, defineExtension, Harness as HarnessFactory} from "@earendil-works/pi-durable";
import {NodeExecutionEnv} from "@earendil-works/pi-durable/env/node";
import {openNodeSqliteStorage} from "@earendil-works/pi-durable/storage/sqlite/node";
import {harnessModels, harnessSettings} from "@supernova/agent-runtime/pi/config/harness-settings";
import type {PromptResources} from "@supernova/agent-runtime/pi/config/system-prompt";
import {createPromptSections} from "@supernova/agent-runtime/pi/config/system-prompt";
import type {SessionState, TurnRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {SessionStateDoc} from "@supernova/agent-runtime/pi/lib/session/session-state";
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
 * One open session file: a Harness over its SQLite storage, the extensions installed in it, and its
 * `supernova.session` state. The session's chat starts as the root conversation. Undo only moves the state's `leaf`;
 * `diverge()` forks there when the agent acts again. Operations act on the branch unless they take a conversation id.
 */
export class SessionFile {
  private constructor(
    public readonly sessionId: string,
    public readonly cwd: string,
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

    const file = new SessionFile(input.sessionId, input.cwd, harness, registry, env);
    file.install(input);

    await harness.root(context, {agent: {cwd: input.cwd}});
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

  /** The `supernova.session` state; its initial value until the first write. */
  public async state(): Promise<SessionState> {
    const state = (await this.harness.snapshot(SessionStateDoc, context)) as SessionState | undefined;
    return state ?? (SessionStateDoc.definition.initial() as SessionState);
  }

  /** Changes the `supernova.session` state in one commit. */
  public async updateState(change: (state: SessionState) => void): Promise<void> {
    await this.harness.commit(async (tx) => {
      change((await tx.doc(SessionStateDoc)) as unknown as SessionState);
    }, context);
  }

  /** A conversation's committed view; the branch by default. */
  public async view(conversationId?: number): Promise<ConversationView> {
    const id = conversationId ?? (await this.state()).branch;
    const state = await (await this.conversation(id)).viewState(context);
    try {
      return state.value!;
    } finally {
      state.dispose();
    }
  }

  /**
   * A conversation's history in append order, inherited fork history and compacted entries included. `after` and
   * `through` bound the entry ids, for reading only what a cached history lacks.
   */
  public async history(conversationId: number, range: {readonly after?: number; readonly through?: number} = {}): Promise<EntryRecord[]> {
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

  /** The active entries and model messages of a conversation's next request, as of entry `at` when given. */
  public async modelContext(conversationId: number, at?: number): Promise<ContextView> {
    //TODO: Being able to pass `at` to context currently relies on a patch applied to pi-durable, waiting for upstream adoption
    return (await this.conversation(conversationId)).context(context, at as EntryId | undefined);
  }

  /**
   * The agent (model, thinking level) the next send starts from: the branch's as of the leaf, or as of the first entry
   * of `history` when nothing is shown. `history` is the branch's, for that case only.
   */
  public async agent(history?: readonly EntryRecord[]): Promise<AgentState | undefined> {
    const {branch, leaf} = await this.state();
    if (leaf === undefined) return (await this.view(branch)).docs["pi.agent"] as AgentState | undefined;
    const at = leaf ?? (history ?? (await this.history(branch)))[0]?.id;
    return at !== undefined ? this.harness.snapshotAsOf(AgentDoc, branch as ConversationId, at as EntryId, context) : undefined;
  }

  /** Calls `listener` with every committed view of a conversation. Returns the unsubscribe. */
  public async watch(conversationId: number, listener: (view: ConversationView) => void): Promise<() => void> {
    const state = await (await this.conversation(conversationId)).viewState(context);
    const unsubscribe = state.subscribe(listener);
    return () => {
      unsubscribe();
      state.dispose();
    };
  }

  /** The first user entry of the active run, or undefined when idle. */
  public async runStart(live: LiveState | undefined): Promise<number | undefined> {
    const entries: number[] = [];
    for (const id of live?.run?.inputs ?? []) {
      const record = await (await this.harness.submission(id, context))?.status(context);
      if (record?.type === "input" && record.entry !== undefined) entries.push(record.entry);
    }
    return entries.length > 0 ? Math.min(...entries) : undefined;
  }

  /** Sets the branch's model and thinking level; they apply from its next request. */
  public async configure(model: {readonly provider: string; readonly modelId: string; readonly thinkingLevel: string}): Promise<void> {
    const conversation = await this.conversation((await this.state()).branch);
    await conversation.configure(
      {model: {provider: model.provider, modelId: model.modelId}, thinkingLevel: model.thinkingLevel as NonNullable<AgentState["thinkingLevel"]>},
      context
    );
  }

  /**
   * Makes the leaf the branch's end before the agent acts: forks the branch there (or starts an empty conversation when
   * nothing is shown), which drops the undone turns. No-op at the branch's end.
   */
  public async diverge(): Promise<void> {
    const {branch, leaf} = await this.state();
    if (leaf === undefined) return;
    const next =
      leaf === null
        ? await this.harness.createConversation({ownership: {kind: "ownerless"}, agent: {cwd: this.cwd}}, context)
        : await (await this.conversation(branch)).fork(leaf as EntryId, {ownership: {kind: "ownerless"}}, context);
    await this.updateState((state) => {
      state.branch = next.id;
      delete state.leaf;
    });
  }

  /**
   * Submits a user input to the branch and records its turn under the placed user entry; call `diverge()` first.
   * Rejects with `SessionBusyError` while a run is active.
   * Resolves with the user entry and a wait for the input's settlement.
   *
   * TODO(queue): with `whenBusy: "steer" | "followUp"` the engine places the input later, at a turn boundary; its
   * turn record (and before-turn checkpoint) must then be written when it is placed, not here.
   */
  public async submit(input: {readonly content: string | (TextContent | ImageContent)[]; readonly record: TurnRecord}) {
    const {branch} = await this.state();
    let submission;
    try {
      submission = await (await this.conversation(branch)).submit({type: "input", content: input.content, whenBusy: "reject"}, context);
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
    return {
      entryId,
      wait: async (): Promise<{readonly status: string; readonly reason?: string; readonly detail?: unknown}> => submission.wait(context),
    };
  }

  /** Aborts the branch's work and resolves once it is idle. */
  public async abort(): Promise<void> {
    await (await this.conversation((await this.state()).branch)).abort(context);
  }

  /** Compacts the branch; resolves once the summary is placed or the compaction ended. Call `diverge()` first. */
  public async compact(): Promise<void> {
    const taskId = await (await this.conversation((await this.state()).branch)).compact(undefined, context);
    const {outcome} = (await this.harness.waitForTask(taskId, context)).state;
    if (outcome.status === "aborted") return;
    if (outcome.status !== "completed") throw new Error(outcome.error?.message ?? `Compaction ${outcome.status}.`);
    const {submissionId} = outcome.result as CompactionResult;
    if (submissionId !== undefined) await (await this.harness.submission(submissionId, context))?.wait(context);
  }

  /**
   * Seeds an empty session with copied history, for forking across session files: entries are appended to the root
   * conversation in one commit with their kind, model messages, data, and head, and turn records follow their
   * remapped user entries.
   */
  public async seed(input: {readonly entries: readonly EntryRecord[]; readonly turns: Readonly<Record<string, TurnRecord>>}): Promise<void> {
    const root = await this.conversation((await this.state()).branch);
    const ids = new Map<number, number>();
    await root.commit(async (tx) => {
      const turns: Record<string, TurnRecord> = {};
      for (const entry of input.entries) {
        const head = entry.head === undefined ? undefined : entry.head === entry.id ? "self" : ids.get(entry.head);
        const copied = await tx.appendEntry(root.id, {
          kind: entry.kind,
          ...(entry.model ? {model: entry.model} : {}),
          ...(entry.data === undefined ? {} : {data: entry.data}),
          ...(head === undefined ? {} : {head: head as EntryId | "self"}),
        });
        ids.set(entry.id, copied.id);
        const turn = input.turns[String(entry.id)];
        if (turn) turns[String(copied.id)] = turn;
      }
      Object.assign(((await tx.doc(SessionStateDoc)) as unknown as SessionState).turns, turns);
    }, context);
  }

  /** Closes the Harness. Running work is not aborted; it resumes when the session opens again. */
  public async close(): Promise<void> {
    await this.harness.close(context);
    await this.env.cleanup(context);
  }

  private async conversation(id: number): Promise<Conversation> {
    const conversation = await this.harness.conversation(id as ConversationId, context);
    if (!conversation) throw new Error(`Conversation ${id} of session ${this.sessionId} does not exist.`);
    return conversation;
  }
}
