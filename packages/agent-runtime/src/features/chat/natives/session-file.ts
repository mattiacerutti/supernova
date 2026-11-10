import {randomUUID} from "node:crypto";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {ImageContent, TextContent} from "@earendil-works/pi-ai";
import type {ModelRuntime, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {AgentState, CompactionResult, Conversation, EntryId, Harness, Registry} from "@earendil-works/pi-durable";
import {ConversationBusy, createRegistry, defineExtension, Harness as HarnessFactory, ROOT_CONVERSATION_ID} from "@earendil-works/pi-durable";
import {NodeExecutionEnv} from "@earendil-works/pi-durable/env/node";
import {openNodeSqliteStorage} from "@earendil-works/pi-durable/storage/sqlite/node";
import type {ForkSeed} from "@supernova/contracts/services/chat/procedures";
import {CheckpointConflictError, CheckpointInheritedError, CheckpointUncapturedError} from "@supernova/contracts/services/chat/procedures";
import type {CheckpointRef, CheckpointStatus, SessionState, TurnPosition, TurnRecord} from "@supernova/agent-runtime/core/session-state";
import {SessionStateDoc, turnPositions} from "@supernova/agent-runtime/core/session-state";
import type {SessionExtension} from "@supernova/agent-runtime/features/chat/durable/coding-tools";
import {createCodingTools} from "@supernova/agent-runtime/features/chat/durable/coding-tools";
import {harnessModels, harnessSettings} from "@supernova/agent-runtime/features/chat/durable/harness-settings";
import {getConversation, getEntries, getState} from "@supernova/agent-runtime/features/chat/durable/reads";
import type {PromptResources} from "@supernova/agent-runtime/features/chat/durable/system-prompt";
import {createPromptSections} from "@supernova/agent-runtime/features/chat/durable/system-prompt";
import {entriesUpToUndoPoint} from "@supernova/agent-runtime/features/chat/lib/transcript/chat-document";
import type {PendingSend} from "@supernova/agent-runtime/features/chat/natives/transcript";
import {Transcript} from "@supernova/agent-runtime/features/chat/natives/transcript";
import type {CheckpointStore} from "@supernova/agent-runtime/features/chat/natives/checkpoint-store";

const context = BACKGROUND_CONTEXT;

export interface SessionFileSetup {
  readonly cwd: string;
  readonly modelRuntime: ModelRuntime;
  readonly settings: () => SettingsManager;
  readonly resources: () => PromptResources;
  readonly extensions: () => readonly SessionExtension[];
}

export interface SessionModel {
  readonly provider: string;
  readonly modelId: string;
  readonly thinkingLevel: string;
}

export interface SentMessage {
  readonly at: string;
  readonly answered: () => Promise<{readonly status: string; readonly reason?: string; readonly detail?: unknown}>;
}

function strictJson<T>(value: T): T {
  // Documents reject `undefined`.
  return JSON.parse(JSON.stringify(value)) as T;
}

export class SessionFile {
  public readonly transcript: Transcript;
  private readonly sessionId: string;
  private readonly cwd: string;
  private readonly harness: Harness;
  private readonly registry: Registry;
  private readonly env: NodeExecutionEnv;
  private readonly checkpoints: CheckpointStore;
  private pending: PendingSend | undefined;

  private constructor(input: {
    readonly sessionId: string;
    readonly cwd: string;
    readonly modelRuntime: ModelRuntime;
    readonly harness: Harness;
    readonly registry: Registry;
    readonly env: NodeExecutionEnv;
    readonly checkpoints: CheckpointStore;
  }) {
    this.sessionId = input.sessionId;
    this.cwd = input.cwd;
    this.harness = input.harness;
    this.registry = input.registry;
    this.env = input.env;
    this.checkpoints = input.checkpoints;
    this.transcript = new Transcript({harness: input.harness, modelRuntime: input.modelRuntime, pending: () => this.pending});
  }

  public static async open(
    input: SessionFileSetup & {readonly sessionId: string; readonly path: string; readonly checkpoints: CheckpointStore; readonly onReport: (error: unknown) => void}
  ): Promise<SessionFile> {
    const env = new NodeExecutionEnv({cwd: input.cwd, shellPath: input.settings().getShellPath()});
    const registry = createRegistry();
    const harness = await HarnessFactory.open(
      await openNodeSqliteStorage(input.path),
      {
        models: harnessModels({modelRuntime: input.modelRuntime, settings: input.settings}),
        registry,
        settings: harnessSettings(input.settings),
        env: () => env,
        onReport: input.onReport,
      },
      context
    );

    const file = new SessionFile({sessionId: input.sessionId, cwd: input.cwd, modelRuntime: input.modelRuntime, harness, registry, env, checkpoints: input.checkpoints});
    file.replaceSetup(input);

    await harness.root(context, {agent: {cwd: input.cwd}});
    // An absent address cannot be observed: the state document exists from the start.
    await file.update(() => undefined);
    harness.resume();

    return file;
  }

  public replaceSetup(setup: SessionFileSetup): void {
    // A same-named `install` replaces in place, so this is also how a reload swaps code; running work keeps the old.
    const extensions: SessionExtension[] = [
      defineExtension({name: "coding-tools", tools: createCodingTools({cwd: setup.cwd, settings: setup.settings()})}),
      defineExtension({name: "prompt", sections: createPromptSections({cwd: setup.cwd, resources: setup.resources})}),
      ...setup.extensions(),
    ];

    for (const extension of extensions) this.registry.install(extension);

    const names = new Set(extensions.map((extension) => extension.name));
    for (const extension of this.registry.snapshot().installed()) {
      if (!names.has(extension.name)) this.registry.uninstall(extension);
    }
  }

  // TODO(queue): with `whenBusy: "steer" | "followUp"` the turn record must be written when the engine places the input.
  public async send(input: {
    readonly content: string | (TextContent | ImageContent)[];
    readonly contentParts: readonly TurnRecord["contentParts"][number][];
    readonly captureCheckpoint: boolean;
    readonly model: SessionModel;
  }): Promise<SentMessage> {
    const turn: TurnRecord = {contentParts: [...input.contentParts], capture: input.captureCheckpoint, before: await this.checkpoint(input.captureCheckpoint)};
    const branch = await this.branchFor(input.model);

    this.pending = {kind: "submitting"};
    let submission;
    let entryId;
    try {
      submission = await branch.submit({type: "input", content: input.content, whenBusy: "reject"}, context);
      const placed = await submission.status(context);
      if (placed.type !== "input" || placed.entry === undefined) throw new Error("The message was not placed.");
      entryId = placed.entry;
    } catch (error) {
      this.pending = undefined;
      throw error instanceof ConversationBusy ? new Error("Session already has active work.") : error;
    }

    this.pending = {kind: "placed", entryId};
    await this.update((state) => {
      state.turns[String(entryId)] = strictJson(turn);
      state.current = turn.before;
    });
    this.pending = undefined;

    const [entry] = await getEntries(this.harness, branch.id, {after: entryId - 1, through: entryId});
    return {at: new Date(entry?.model?.[0]?.timestamp ?? Date.now()).toISOString(), answered: () => submission.wait(context)};
  }

  public async compact(model: SessionModel): Promise<void> {
    const taskId = await (await this.branchFor(model)).compact(undefined, context);
    const {outcome} = (await this.harness.waitForTask(taskId, context)).state;
    if (outcome.status === "aborted") return;
    if (outcome.status !== "completed") throw new Error(outcome.error?.message ?? `Compaction ${outcome.status}.`);

    const {submissionId} = outcome.result as CompactionResult;
    if (submissionId !== undefined) await (await this.harness.submission(submissionId, context))?.wait(context);
  }

  public async stop(): Promise<void> {
    await (await getConversation(this.harness, (await getState(this.harness)).branch)).abort(context);
  }

  public async isRunning(): Promise<boolean> {
    const {view} = await this.transcript.currentFrame();
    return view.docs["pi.live"]?.run !== undefined;
  }

  public async moveLeaf(force: boolean, target: (position: {readonly turns: readonly TurnPosition[]; readonly active: number}) => number): Promise<void> {
    const state = await getState(this.harness);
    const turns = turnPositions(await getEntries(this.harness, state.branch), state.turns);
    const {leaf, current} = state;

    const active = leaf === undefined ? turns.length : turns.filter((turn) => leaf !== null && Number(turn.turnId) <= leaf).length;

    const count = target({turns, active});
    const boundary = count < active ? turns[count]?.record.before : turns[count - 1]?.record.after;
    // Restore first: a failed restore leaves the undo point where it was.
    if (boundary?.status === "captured") await this.restore(boundary, current, force);

    await this.update((next) => {
      if (count >= turns.length) delete next.leaf;
      else next.leaf = turns[count - 1]?.endId ?? null;
      if (boundary) next.current = boundary;
    });
  }

  public async recordAfterTurnCheckpoints(): Promise<void> {
    // Every open record, so turns whose run ended while the host was down get one too.
    const open = Object.entries((await getState(this.harness)).turns).filter(([, record]) => record.after === undefined);
    if (open.length === 0) return;

    const after = await this.checkpoint(open.some(([, record]) => record.capture));
    await this.update((state) => {
      for (const [turnId] of open) {
        const record = state.turns[turnId];
        if (record) state.turns[turnId] = {...record, after: record.capture ? after : {...after, status: "disabled"}};
      }
      state.current = after;
    });
  }

  public async forkSeed(turnId: string): Promise<ForkSeed> {
    const state = await getState(this.harness);
    const active = entriesUpToUndoPoint(await getEntries(this.harness, state.branch), state.leaf);
    const turn = turnPositions(active, state.turns).find((candidate) => candidate.turnId === turnId);
    if (!turn) throw new Error("This message cannot be forked.");

    const agent = await this.transcript.agentStateAt(state.branch, state.leaf);
    const entries = active.filter((entry) => entry.id <= turn.endId && entry.kind !== "pi.system");
    const turns = Object.fromEntries(entries.flatMap((entry) => (state.turns[String(entry.id)] ? [[String(entry.id), state.turns[String(entry.id)]!]] : [])));
    const model = agent?.model ? {provider: agent.model.provider, modelId: agent.model.modelId, thinkingLevel: agent.thinkingLevel ?? "off"} : undefined;
    return strictJson({entries: [...entries], turns, ...(model ? {model} : {})});
  }

  public async seed(seed: ForkSeed): Promise<void> {
    const root = await getConversation(this.harness, ROOT_CONVERSATION_ID);
    const ids = new Map<number, number>();
    await root.commit(async (tx) => {
      const turns: Record<string, TurnRecord> = {};
      for (const entry of seed.entries) {
        const head = entry.head === undefined ? undefined : entry.head === entry.id ? "self" : ids.get(entry.head);
        const copied = await tx.appendEntry(root.id, {
          kind: entry.kind,
          ...(entry.model ? {model: entry.model} : {}),
          ...(entry.data === undefined ? {} : {data: entry.data}),
          ...(head === undefined ? {} : {head: head as EntryId | "self"}),
        });
        ids.set(entry.id, copied.id);
        const record = seed.turns[String(entry.id)] as TurnRecord | undefined;
        if (record) turns[String(copied.id)] = record;
      }
      Object.assign(((await tx.doc(SessionStateDoc)) as unknown as SessionState).turns, turns);
    }, context);

    if (seed.model) await this.configure(root, seed.model);
  }

  public async close(): Promise<void> {
    await this.harness.close(context);
    await this.env.cleanup(context);
  }

  private async checkpoint(capture: boolean): Promise<CheckpointRef> {
    const checkpointId = randomUUID();
    const status: CheckpointStatus = !capture
      ? "disabled"
      : await this.checkpoints
          .capture({checkpointId, projectRoot: this.cwd, sessionId: this.sessionId})
          .then(() => "captured" as const)
          .catch(() => "failed" as const);
    return {checkpointId, sessionId: this.sessionId, status};
  }

  private async restore(boundary: CheckpointRef, current: CheckpointRef | undefined, force: boolean): Promise<void> {
    // A fork copies the history, not the workspace snapshots behind it.
    if (boundary.sessionId !== this.sessionId) throw new CheckpointInheritedError({message: "This message came from the session this one was forked from."});
    const currentCaptured = current?.status === "captured" && current.sessionId === this.sessionId;
    if (!currentCaptured && !force) {
      throw new CheckpointUncapturedError({message: "The current checkpoint has no workspace snapshot. Restoring may discard uncaptured changes."});
    }

    try {
      await this.checkpoints.restore({
        checkpointId: boundary.checkpointId,
        force,
        fromCheckpointId: currentCaptured ? current.checkpointId : undefined,
        projectRoot: this.cwd,
        sessionId: this.sessionId,
      });
    } catch (cause) {
      if (cause instanceof CheckpointConflictError) throw cause;
      throw new Error("Failed to restore workspace checkpoint.");
    }
  }

  private async update(change: (state: SessionState) => void): Promise<void> {
    await this.harness.commit(async (tx) => {
      change((await tx.doc(SessionStateDoc)) as unknown as SessionState);
    }, context);
  }

  private async configure(branch: Conversation, model: SessionModel): Promise<void> {
    await branch.configure({model: {provider: model.provider, modelId: model.modelId}, thinkingLevel: model.thinkingLevel as NonNullable<AgentState["thinkingLevel"]>}, context);
  }

  private async branchFor(model: SessionModel): Promise<Conversation> {
    const {branch, leaf} = await getState(this.harness);
    let target = await getConversation(this.harness, branch);
    if (leaf !== undefined) {
      target =
        leaf === null
          ? await this.harness.createConversation({ownership: {kind: "ownerless"}, agent: {cwd: this.cwd}}, context)
          : await target.fork(leaf as EntryId, {ownership: {kind: "ownerless"}}, context);
      await this.update((state) => {
        state.branch = target.id;
        delete state.leaf;
      });
    }

    await this.configure(target, model);
    return target;
  }
}
