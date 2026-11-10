import type {Context} from "@earendil-works/chord/context";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {ModelRuntime} from "@earendil-works/pi-coding-agent";
import type {AgentState, ConversationId, ConversationView, EntryId, EntryRecord, Observation, Observer} from "@earendil-works/pi-durable";
import {AgentDoc} from "@earendil-works/pi-durable";
import type {HistorySide} from "@supernova/contracts/services/chat/procedures";
import type {ChatContextUsage, ChatEntries} from "@supernova/contracts/services/chat/schemas";
import type {SessionState} from "@supernova/agent-runtime/core/session-state";
import {SessionStateDoc} from "@supernova/agent-runtime/core/session-state";
import type {HarnessReader} from "@supernova/agent-runtime/features/chat/durable/reads";
import {getConversation, getEntries, getState, getConversationView} from "@supernova/agent-runtime/features/chat/durable/reads";
import type {BranchEntries} from "@supernova/agent-runtime/features/chat/lib/transcript/chat-document";
import {appendViewEntries, cachedEntriesFor, entriesUpToUndoPoint, withoutSystemEntries} from "@supernova/agent-runtime/features/chat/lib/transcript/chat-document";
import {contextUsage} from "@supernova/agent-runtime/features/chat/lib/transcript/context-usage";
import {historyPage} from "@supernova/agent-runtime/features/chat/lib/transcript/history-page";

const context = BACKGROUND_CONTEXT;

export interface TranscriptFrame {
  readonly state: SessionState;
  readonly view: ConversationView;
}

export type PendingSend = {readonly kind: "submitting"} | {readonly kind: "placed"; readonly entryId: number};

export class Transcript {
  private readonly harness: HarnessReader;
  private readonly modelRuntime: ModelRuntime;
  private readonly pending: () => PendingSend | undefined;

  // Durable's view holds only the branch's newest entries; the timeline pages through all of them.
  private cachedBranch: BranchEntries | undefined;

  public constructor(input: {readonly harness: HarnessReader; readonly modelRuntime: ModelRuntime; readonly pending: () => PendingSend | undefined}) {
    this.harness = input.harness;
    this.modelRuntime = input.modelRuntime;
    this.pending = input.pending;
  }

  public async follow(observer: Observer<TranscriptFrame>, attaching: Context): Promise<Observation<TranscriptFrame>> {
    let state = await getState(this.harness);
    // An observation's `value` is the one at its attachment; later values come only through `advance`.
    let view: ConversationView | undefined;
    let viewed: Observation<ConversationView> | undefined;
    let detached = false;

    const detach = () => {
      detached = true;
      stated?.detach();
      viewed?.detach();
    };

    const fail = (end: Parameters<Observer<unknown>["end"]>[0]) => {
      if (end.kind !== "failed" || detached) return;
      detach();
      observer.end(end);
    };

    const emit = (at: Context) => {
      // Between a branch move and its view's attachment, the old view does not match the state.
      if (detached || !view || view.conversation.id !== state.branch) return;
      // A send's message lands a commit before its turn record; the frames in between would show it without one.
      const pending = this.pending();
      if (pending && (pending.kind === "submitting" || !state.turns[String(pending.entryId)])) return;
      const value = {state, view};
      observer.advance({kind: "value", value, ops: [["r", value as never]], retired: false}, at);
    };

    const watch = async (branch: number, at: Context) => {
      const previous = viewed;
      const observed = await this.harness.observeConversation(
        branch as ConversationId,
        {
          advance: (call, callAt) => {
            if (call.kind !== "value") return;
            view = call.value;
            emit(callAt);
          },
          end: fail,
        },
        at
      );
      if (!view || view.conversation.id !== branch) view = observed.value;
      viewed = observed;
      previous?.detach();
    };

    const stated = await this.harness.observeDoc(
      SessionStateDoc,
      {
        advance: (call, at) => {
          if (call.kind !== "value") return;
          // A send after an undo moves the state to a new branch.
          const moved = (call.value as SessionState).branch !== state.branch;
          state = call.value as SessionState;
          if (!moved) return emit(at);
          // Durable's rule: `advance` only records, so the new branch is watched after it returns.
          queueMicrotask(
            () =>
              void watch(state.branch, context).then(
                () => emit(context),
                (error: unknown) => fail({kind: "failed", error: error as Error})
              )
          );
        },
        end: fail,
      },
      attaching
    );
    if (!stated) throw new Error("The session's state is missing.");

    state = stated.value as SessionState;
    await watch(state.branch, attaching);
    return {value: {state, view: view!}, detach};
  }

  public async currentFrame(): Promise<TranscriptFrame> {
    const state = await getState(this.harness);
    return {state, view: await getConversationView(this.harness, state.branch)};
  }

  public async branchEntries(view: ConversationView): Promise<BranchEntries> {
    this.cachedBranch = appendViewEntries(this.cachedBranch, view) ?? {branch: view.conversation.id, entries: await this.readMissingEntries(view)};
    return this.cachedBranch;
  }

  public async agentStateAt(branch: number, at: SessionState["leaf"]): Promise<AgentState | undefined> {
    if (at === undefined) return (await getConversationView(this.harness, branch)).docs["pi.agent"] as AgentState | undefined;

    // Everything undone: the state as the first turn began.
    const entryId = at ?? (await this.firstEntryId(branch));
    return entryId === undefined ? undefined : this.harness.snapshotAsOf(AgentDoc, branch as ConversationId, entryId as EntryId, context);
  }

  public async contextUsageAt(branch: number, at: SessionState["leaf"]): Promise<ChatContextUsage> {
    const agent = await this.agentStateAt(branch, at);
    const contextWindow = agent?.model ? (this.modelRuntime.getModel(agent.model.provider, agent.model.modelId)?.contextWindow ?? 0) : 0;
    if (at === null) return {contextWindow, usedTokens: 0};

    const {entries, messages} = await (await getConversation(this.harness, branch)).context(context, at === undefined ? {} : {at: at as EntryId});
    return entries.length > 0 ? contextUsage({contextWindow, entries, messages}) : {contextWindow, usedTokens: 0};
  }

  public async loadHistory(input: {readonly side: HistorySide; readonly edge: number}): Promise<ChatEntries> {
    const {state, view} = await this.currentFrame();
    const {entries} = await this.branchEntries(view);
    const active = entriesUpToUndoPoint(entries, state.leaf);
    const side = input.side === "entries" ? active : entries.slice(active.length);
    const at = side.findIndex((entry) => entry.id === input.edge);
    if (at === -1) throw new Error(`This part of the conversation is no longer ${input.side === "entries" ? "shown" : "undone"}.`);

    return historyPage({
      side: input.side,
      entries: input.side === "entries" ? side.slice(0, at) : side.slice(at + 1),
      turns: state.turns,
      precedingEntryId: input.side === "undone" ? input.edge : undefined,
    });
  }

  // Entry IDs are session-wide, so the missing range ends at `view.before`, not at the next ID.
  private async readMissingEntries(view: ConversationView): Promise<readonly EntryRecord[]> {
    const cached = cachedEntriesFor(this.cachedBranch, view) ?? [];
    const lastId = cached.at(-1)?.id ?? 0;

    const missing = view.before !== undefined && view.before > lastId ? await getEntries(this.harness, view.conversation.id, {after: lastId, through: view.before}) : [];
    return [...cached, ...withoutSystemEntries([...missing, ...view.entries.filter((entry) => entry.id > lastId)])];
  }

  private async firstEntryId(branch: number): Promise<number | undefined> {
    const entries = this.cachedBranch?.branch === branch ? this.cachedBranch.entries : withoutSystemEntries(await getEntries(this.harness, branch));
    return entries[0]?.id;
  }
}
