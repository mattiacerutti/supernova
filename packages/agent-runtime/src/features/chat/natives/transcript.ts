import type {Context} from "@earendil-works/chord/context";
import {withoutAbortSignal} from "@earendil-works/chord/context";
import type {ModelRuntime} from "@earendil-works/pi-coding-agent";
import type {AgentState, ConversationId, ConversationView, EntryId, EntryRecord, Observation, Observer} from "@earendil-works/pi-durable";
import type {HistorySide} from "@supernova/contracts/services/chat/procedures";
import type {ChatContextUsage, ChatEntries} from "@supernova/contracts/services/chat/schemas";
import type {SessionState} from "@supernova/agent-runtime/core/session-state";
import {SessionStateDoc} from "@supernova/agent-runtime/core/session-state";
import type {HarnessReader} from "@supernova/agent-runtime/features/chat/durable/reads";
import {getConversation, getEntries, getLastEntryId, getState} from "@supernova/agent-runtime/features/chat/durable/reads";
import {contextUsage} from "@supernova/agent-runtime/features/chat/lib/transcript/context-usage";
import type {Turns} from "@supernova/agent-runtime/features/chat/lib/transcript/history-page";
import {entriesSize, historyPage, joinsPage, PAGE_TURNS, turnIds, withoutSystemEntries} from "@supernova/agent-runtime/features/chat/lib/transcript/history-page";

export interface TranscriptFrame {
  readonly state: SessionState;
  readonly view: ConversationView;
  readonly undone: readonly EntryRecord[];
}

interface ConversationObservation {
  readonly conversation: ConversationId;
  readonly undone: readonly EntryRecord[];
  view(): ConversationView;
  detach(): void;
}

// Changes on a navigation, and once per page of new turns.
function observationKey(state: SessionState): string {
  // With turns undone the conversation cannot grow; without, every turn record is the conversation's.
  if (state.redoConversation !== undefined) return `${state.conversation}:${state.redoConversation}`;
  return `${state.conversation}:${Math.floor(turnIds(state.turns).length / PAGE_TURNS)}`;
}

function frameOf(state: SessionState, observation: ConversationObservation): TranscriptFrame {
  return {state, view: observation.view(), undone: state.redoConversation === undefined ? [] : observation.undone};
}

export type PendingSend = {readonly kind: "submitting"} | {readonly kind: "placed"; readonly entryId: number};

export class Transcript {
  private readonly harness: HarnessReader;
  private readonly modelRuntime: ModelRuntime;
  private readonly pending: () => PendingSend | undefined;
  private latest: TranscriptFrame | undefined;

  public constructor(input: {readonly harness: HarnessReader; readonly modelRuntime: ModelRuntime; readonly pending: () => PendingSend | undefined}) {
    this.harness = input.harness;
    this.modelRuntime = input.modelRuntime;
    this.pending = input.pending;
  }

  public async follow(observer: Observer<TranscriptFrame>, attaching: Context): Promise<Observation<TranscriptFrame>> {
    let state: SessionState | undefined;
    let conversationObservation: ConversationObservation | undefined;
    let requestedKey: string | undefined;
    let detached = false;
    // The follow outlives the attach call; its replacements keep the call's telemetry, not its cancellation.
    const following = withoutAbortSignal(attaching);

    const emit = (at: Context) => {
      if (detached || !conversationObservation || conversationObservation.conversation !== state!.conversation || this.awaitsTurnRecord(state!)) return;
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

    const replaceObservation = async (target: SessionState) => {
      const next = await this.observeCurrentConversation(target, {changed: emit, end: fail}, following);
      if (detached || requestedKey !== observationKey(target)) return next.detach();
      conversationObservation?.detach();
      conversationObservation = next;
      emit(following);
    };

    const step = (at: Context) => {
      if (!conversationObservation) return;

      emit(at);

      const key = observationKey(state!);
      if (key === requestedKey) return;
      requestedKey = key;
      const target = state!;

      // Durable's rule: an observer only records, so the read starts after `advance` returns.
      queueMicrotask(() => void replaceObservation(target).catch((error: unknown) => fail({kind: "failed", error: error as Error})));
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

    requestedKey = observationKey(initialState);

    conversationObservation = await this.observeCurrentConversation(initialState, {changed: emit, end: fail}, attaching);

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

  private awaitsTurnRecord(state: SessionState): boolean {
    // A send's message lands a commit before its turn record; the frames in between would show it without one.
    const pending = this.pending();
    return !!pending && (pending.kind === "submitting" || !state.turns[String(pending.entryId)]);
  }

  private async observeCurrentConversation(
    state: SessionState,
    events: {readonly changed: (at: Context) => void; readonly end: Observer<unknown>["end"]},
    at: Context
  ): Promise<ConversationObservation> {
    const {conversation, redoConversation, turns} = state;
    // Records after the conversation's end are the undone turns'.
    const end = redoConversation === undefined ? undefined : ((await getLastEntryId(this.harness, conversation, at)) ?? null);
    const undone = redoConversation === undefined ? [] : (await this.readPage(redoConversation, turns, "undone", end!, at)).entries;
    // The turn before the newest page shows the page is whole.
    const from = turnIds(turns)
      .filter((id) => end === undefined || (end !== null && id <= end))
      .at(-(PAGE_TURNS + 1));

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
    const {conversation, redoConversation, turns} = await getState(this.harness, context);
    const lastShownEntryId = redoConversation === undefined ? undefined : ((await getLastEntryId(this.harness, conversation, context)) ?? null);
    // A stale edge (another conversation, or the other side of a moved undo point) has no page here.
    const onSide =
      side === "entries"
        ? turns[String(edge)] !== undefined && (lastShownEntryId === undefined || (lastShownEntryId !== null && edge <= lastShownEntryId))
        : lastShownEntryId !== undefined && (lastShownEntryId === null || edge > lastShownEntryId);
    if (!onSide) throw new Error(`This part of the conversation is no longer ${side === "entries" ? "shown" : "undone"}.`);

    const {entries} = await this.readPage(redoConversation ?? conversation, turns, side, side === "entries" ? edge - 1 : edge, context);
    return historyPage({side, entries, turns, ...(side === "undone" ? {precedingEntryId: edge} : {})});
  }

  /**
   * Reads `side`'s page a turn at a time: back through `edge` on `"entries"`, forward after it on `"undone"` (`null`:
   * nothing is shown). `ended`: the reads reached the conversation's start or end before the page filled.
   */
  private async readPage(
    conversation: ConversationId,
    turns: Turns,
    side: HistorySide,
    edge: number | null,
    context: Context
  ): Promise<{readonly entries: EntryRecord[]; readonly ended: boolean}> {
    const back = side === "entries";
    const at = edge ?? 0;
    const ranges = turnRanges(turns).flatMap((range) => {
      if (back) return range.after < at ? [{after: range.after, through: Math.min(range.through ?? at, at)}] : [];
      return range.through === undefined || range.through > at ? [{...range, after: Math.max(range.after, at)}] : [];
    });

    const read: EntryRecord[][] = [];
    let size = 0;
    let ended = true;
    for (const range of back ? ranges.toReversed() : ranges) {
      const turn = withoutSystemEntries(await getEntries(this.harness, conversation, range, context));
      read.push(turn);
      // The turn past the page is read too: it shows the page is whole.
      const turnSize = entriesSize(turn);
      if (!joinsPage(read.length - 1, size, turnSize)) {
        ended = false;
        break;
      }
      size += turnSize;
    }
    return {entries: (back ? read.toReversed() : read).flat(), ended};
  }
}

/**
 * Each turn's stored range, oldest first: from its user entry to the entry before the next turn's. The first turn also
 * holds the entries before it (a leading compaction); without turns, the conversation is one range.
 */
function turnRanges(turns: Turns): {readonly after: number; readonly through?: number}[] {
  const ids = turnIds(turns);
  if (ids.length === 0) return [{after: 0}];
  return ids.map((id, index) => {
    const next = ids[index + 1];
    return {after: index === 0 ? 0 : id - 1, ...(next === undefined ? {} : {through: next - 1})};
  });
}
