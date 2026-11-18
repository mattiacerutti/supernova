import type {Context} from "@earendil-works/chord/context";
import {withoutAbortSignal} from "@earendil-works/chord/context";
import type {ModelRuntime} from "@earendil-works/pi-coding-agent";
import type {AgentState, ConversationId, ConversationView, EntryId, EntryRecord, Observation, Observer} from "@earendil-works/pi-durable";
import type {HistorySide} from "@supernova/contracts/services/chat/procedures";
import type {ChatContextUsage, ChatEntries} from "@supernova/contracts/services/chat/schemas";
import type {SessionState} from "@supernova/agent-runtime/core/session-state";
import {SessionStateDoc} from "@supernova/agent-runtime/core/session-state";
import type {HarnessReader} from "@supernova/agent-runtime/features/chat/durable/reads";
import {getConversation, getEntries, getLastEntryId, getLastTurn, getState, readEntries} from "@supernova/agent-runtime/features/chat/durable/reads";
import {contextUsage} from "@supernova/agent-runtime/features/chat/lib/transcript/context-usage";
import {entriesSize, historyPage, isTurnStart, joinsPage, PAGE_TURNS, turnsThrough} from "@supernova/agent-runtime/features/chat/lib/transcript/history-page";
import {userEntryData} from "@supernova/contracts/services/chat/schemas";

export interface TranscriptFrame {
  readonly state: SessionState;
  readonly view: ConversationView;
  readonly undone: readonly EntryRecord[];
  readonly lastUndoneTurnIndex?: number;
}

interface ConversationObservation {
  readonly conversation: ConversationId;
  readonly undone: readonly EntryRecord[];
  readonly lastUndoneTurnIndex: number | undefined;
  view(): ConversationView;
  detach(): void;
}

// Changes on a navigation, and once per page of new turns.
function observationKey(state: SessionState, turns: number): string {
  // With turns undone the conversation cannot grow.
  if (state.redoConversation !== undefined) return `${state.conversation}:${state.redoConversation}`;
  return `${state.conversation}:${Math.floor(turns / PAGE_TURNS)}`;
}

function turnsOf(observation: ConversationObservation): number {
  return turnsThrough(observation.view().entries);
}

function frameOf(state: SessionState, observation: ConversationObservation): TranscriptFrame {
  if (state.redoConversation === undefined) return {state, view: observation.view(), undone: []};
  return {
    state,
    view: observation.view(),
    undone: observation.undone,
    ...(observation.lastUndoneTurnIndex === undefined ? {} : {lastUndoneTurnIndex: observation.lastUndoneTurnIndex}),
  };
}

export class Transcript {
  private readonly harness: HarnessReader;
  private readonly modelRuntime: ModelRuntime;
  private latest: TranscriptFrame | undefined;

  public constructor(input: {readonly harness: HarnessReader; readonly modelRuntime: ModelRuntime}) {
    this.harness = input.harness;
    this.modelRuntime = input.modelRuntime;
  }

  public async follow(observer: Observer<TranscriptFrame>, attaching: Context): Promise<Observation<TranscriptFrame>> {
    let state: SessionState | undefined;
    let conversationObservation: ConversationObservation | undefined;
    let requestedKey: string | undefined;
    let detached = false;
    // The follow outlives the attach call; its replacements keep the call's telemetry, not its cancellation.
    const following = withoutAbortSignal(attaching);

    const emit = (at: Context) => {
      if (detached || !conversationObservation || conversationObservation.conversation !== state!.conversation) return;
      this.latest = frameOf(state!, conversationObservation);
      observer.advance({kind: "value", value: this.latest, ops: [["r", this.latest as never]], retired: false}, at);
    };

    const detach = () => {
      detached = true;
      this.latest = undefined;
      stateObservation?.detach();
      conversationObservation?.detach();
    };

    const fail = (end: Parameters<Observer<unknown>["end"]>[0]) => {
      if (end.kind !== "failed" || detached) return;
      detach();
      observer.end(end);
    };

    const replaceObservation = async (target: SessionState, key: string) => {
      const next = await this.observeCurrentConversation(target, {changed: step, end: fail}, following);
      if (detached || requestedKey !== key) return next.detach();
      conversationObservation?.detach();
      conversationObservation = next;
      // From the new view's turns: the request's key may predate turns it already has.
      requestedKey = observationKey(target, turnsOf(next));
      emit(following);
    };

    const step = (at: Context) => {
      if (!conversationObservation) return;

      emit(at);

      const observed = conversationObservation.conversation === state!.conversation;
      const key = observationKey(state!, observed ? turnsOf(conversationObservation) : 0);
      if (key === requestedKey) return;
      requestedKey = key;
      const target = state!;

      // Durable's rule: an observer only records, so the read starts after `advance` returns.
      queueMicrotask(() => void replaceObservation(target, key).catch((error: unknown) => fail({kind: "failed", error: error as Error})));
    };

    const stateObservation = await this.harness.observeDoc(
      SessionStateDoc,
      {
        advance: (call, at) => {
          if (call.kind !== "value") return;
          state = call.value as SessionState;
          step(at);
        },
        end: fail,
      },
      attaching
    );
    if (!stateObservation) throw new Error("The session's state is missing.");

    // An advance during the attachment is newer than its value.
    const initialState = state ?? (stateObservation.value as SessionState);
    state = initialState;

    conversationObservation = await this.observeCurrentConversation(initialState, {changed: step, end: fail}, attaching);
    requestedKey = observationKey(initialState, turnsOf(conversationObservation));

    const firstFrame = frameOf(initialState, conversationObservation);
    this.latest = firstFrame;

    // A state change during the attachment could not emit yet; Chord applies this advance over the first frame.
    step(attaching);

    return {value: firstFrame, detach};
  }

  public async currentFrame(context: Context): Promise<TranscriptFrame> {
    if (this.latest) return this.latest;
    const state = await getState(this.harness, context);
    const observation = await this.observeCurrentConversation(state, {changed: () => undefined, end: () => undefined}, context);
    observation.detach();
    return frameOf(state, observation);
  }

  private async observeCurrentConversation(
    state: SessionState,
    events: {readonly changed: (at: Context) => void; readonly end: Observer<unknown>["end"]},
    at: Context
  ): Promise<ConversationObservation> {
    const {conversation, redoConversation} = state;
    // Entries after the conversation's end are the undone turns'.
    const end = redoConversation === undefined ? undefined : ((await getLastEntryId(this.harness, conversation, at)) ?? null);
    const undone = redoConversation === undefined ? [] : await this.readPage(redoConversation, "undone", end!, at);
    const lastUndoneTurnIndex = redoConversation === undefined ? undefined : userEntryData(await getLastTurn(this.harness, redoConversation, undefined, at))?.turnIndex;
    const from = await this.windowStart(conversation, at);

    let view: ConversationView | undefined;
    const observed = await this.harness.observeConversation(
      conversation,
      {
        advance: (call, callAt) => {
          if (call.kind !== "value") return;
          view = call.value;
          events.changed(callAt);
        },
        end: events.end,
      },
      at,
      // Never trimmed, so a commit of any size (a fork's seed) arrives whole.
      {min: Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER, ...(from === undefined ? {} : {from: from as EntryId})}
    );
    return {
      conversation,
      undone,
      lastUndoneTurnIndex,
      // Commits during the attachment advanced it past its value.
      view: () => view ?? observed.value,
      detach: () => observed.detach(),
    };
  }

  public async contextUsage(conversation: ConversationId, view: ConversationView, context: Context): Promise<ChatContextUsage> {
    const agent = view.docs["pi.agent"] as AgentState | undefined;
    const contextWindow = agent?.model ? (this.modelRuntime.getModel(agent.model.provider, agent.model.modelId)?.contextWindow ?? 0) : 0;

    const {entries, messages} = await (await getConversation(this.harness, conversation, context)).context(context);
    return entries.length > 0 ? contextUsage({contextWindow, entries, messages}) : {contextWindow, usedTokens: 0};
  }

  public async loadHistory(input: {readonly side: HistorySide; readonly edge: number}, context: Context): Promise<ChatEntries> {
    const {side, edge} = input;
    const {conversation, redoConversation} = await getState(this.harness, context);
    const lastShownEntryId = redoConversation === undefined ? undefined : ((await getLastEntryId(this.harness, conversation, context)) ?? null);
    // A stale edge (another conversation, or the other side of a moved undo point) has no page here.
    const onSide =
      side === "entries"
        ? (lastShownEntryId === undefined || (lastShownEntryId !== null && edge <= lastShownEntryId)) &&
          (await getEntries(this.harness, conversation, {after: edge - 1, through: edge}, context)).some(isTurnStart)
        : lastShownEntryId !== undefined && (lastShownEntryId === null || edge > lastShownEntryId);
    if (!onSide) throw new Error(`This part of the conversation is no longer ${side === "entries" ? "shown" : "undone"}.`);

    if (side === "entries") return historyPage({side, entries: await this.readPage(conversation, side, edge - 1, context)});
    const entries = await this.readPage(redoConversation!, side, edge, context);
    const lastTurnIndex = userEntryData(await getLastTurn(this.harness, redoConversation!, undefined, context))?.turnIndex;
    return historyPage({side, entries, precedingEntryId: edge, ...(lastTurnIndex === undefined ? {} : {lastTurnIndex})});
  }

  /** The turn before the newest page, which shows the page is whole. */
  private async windowStart(conversation: ConversationId, context: Context): Promise<number | undefined> {
    let turns = 0;
    for await (const entry of readEntries(this.harness, conversation, {order: "descending"}, context)) {
      if (isTurnStart(entry) && ++turns === PAGE_TURNS + 1) return entry.id;
    }
    return undefined;
  }

  /**
   * Reads `side`'s page a turn at a time: back through `edge` on `"entries"`, forward after it on `"undone"` (`null`:
   * nothing is shown). The turn past the page is read too: it shows the page is whole.
   */
  private async readPage(conversation: ConversationId, side: HistorySide, edge: number | null, context: Context): Promise<EntryRecord[]> {
    const back = side === "entries";
    const at = edge ?? 0;
    const range = back ? {through: at, order: "descending" as const} : {after: at, order: "ascending" as const};
    const turns: EntryRecord[][] = [];
    let turn: EntryRecord[] = [];
    let turnStarted = false;
    let size = 0;
    const pageTakes = (): boolean => {
      const turnSize = entriesSize(turn);
      const joins = joinsPage(turns.length, size, turnSize);
      turns.push(turn);
      turn = [];
      turnStarted = false;
      size += turnSize;
      return joins;
    };

    for await (const entry of readEntries(this.harness, conversation, range, context)) {
      if (entry.kind === "pi.system") continue;
      // Forwards, the entries before the first turn (a leading continuation) belong to it.
      if (!back && isTurnStart(entry) && turnStarted && !pageTakes()) return turns.flat();
      turn.push(entry);
      if (isTurnStart(entry)) turnStarted = true;
      if (back && turnStarted && !pageTakes()) return turns.flat().toReversed();
    }
    // Backwards, the entries before the first turn (a leading compaction) belong to it.
    if (back && turn.length > 0 && turns.length > 0) turns.at(-1)!.push(...turn);
    else if (turn.length > 0) turns.push(turn);
    return back ? turns.flat().toReversed() : turns.flat();
  }
}
