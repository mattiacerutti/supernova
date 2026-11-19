import type {AgentState, ConversationView, EntryRecord, LiveState, UsageState} from "@earendil-works/pi-durable";
import type {ChatContextUsage, ChatDocument} from "@supernova/contracts/services/chat/schemas";
import type {SessionRecord, SessionState, TurnCheckpoints} from "@supernova/agent-runtime/core/session-state";
import {historyPage, withoutSystemEntries} from "@supernova/agent-runtime/features/chat/lib/transcript/history-page";

const copiedTurnIds = new WeakMap<Readonly<Record<string, TurnCheckpoints>>, readonly number[]>();

// Changes when the conversation moves or grows: then its context usage is stale.
export function contextKey(frame: {readonly state: SessionState; readonly view: ConversationView}): string {
  const {state, view} = frame;
  return `${state.conversation}:${view.entries.at(-1)?.id ?? view.before}`;
}

// From the checkpoints, as the copied turns may lie before the view: theirs belong to the source session.
function lastCopiedTurnId(checkpoints: Readonly<Record<string, TurnCheckpoints>>, sessionId: string, lastShownEntryId: number | null | undefined): string | undefined {
  let ids = copiedTurnIds.get(checkpoints);
  if (!ids) {
    ids = Object.entries(checkpoints)
      .filter(([, record]) => record.before.sessionId !== sessionId)
      .map(([turnId]) => Number(turnId))
      .toSorted((left, right) => left - right);
    copiedTurnIds.set(checkpoints, ids);
  }
  const last = ids.findLast((turnId) => lastShownEntryId === undefined || (lastShownEntryId !== null && turnId <= lastShownEntryId));
  return last === undefined ? undefined : String(last);
}

export function chatDocument(input: {
  readonly record: Pick<SessionRecord, "id" | "forkedFrom" | "updatedAt">;
  readonly view: ConversationView;
  readonly undone: readonly EntryRecord[];
  readonly lastUndoneTurnIndex?: number;
  readonly state: SessionState;
  readonly contextUsage: ChatContextUsage;
}): ChatDocument {
  const {contextUsage, record, state, view} = input;
  const active = withoutSystemEntries(view.entries);
  // The current conversation ends at the undo point.
  const lastShownEntryId = state.redoConversation === undefined ? undefined : (active.at(-1)?.id ?? null);
  const live = view.docs["pi.live"] as LiveState | undefined;
  const runStart = live?.run?.first;

  const entries = historyPage({side: "entries", entries: active});
  const undone = historyPage({
    side: "undone",
    entries: input.undone,
    ...(input.lastUndoneTurnIndex === undefined ? {} : {lastTurnIndex: input.lastUndoneTurnIndex}),
    ...(active.length > 0 ? {precedingEntryId: active.at(-1)!.id} : {}),
  });
  const copiedTurnId = record.forkedFrom !== undefined ? lastCopiedTurnId(state.checkpoints, record.id, lastShownEntryId) : undefined;

  // A running session does not keep climbing the sidebar.
  const liveStart = runStart === undefined ? -1 : entries.items.findIndex((entry) => entry.id >= runStart);
  const settled = liveStart === -1 ? entries.items : entries.items.slice(0, liveStart + 1);
  const lastTimestamp = settled.findLast((entry) => entry.model?.[0]?.timestamp !== undefined)?.model?.[0]?.timestamp;
  const lastActivity = lastTimestamp === undefined ? undefined : new Date(lastTimestamp).toISOString();

  return {
    id: record.id,
    ...(copiedTurnId ? {lastCopiedTurnId: copiedTurnId} : {}),
    updatedAt: lastActivity !== undefined && lastActivity > record.updatedAt ? lastActivity : record.updatedAt,
    entries,
    undone,
    // A fork takes the agent as it was at its fork point, so after an undo too it is the shown turns'.
    agent: (view.docs["pi.agent"] as AgentState | undefined) ?? {},
    live: live ?? {},
    usage: (view.docs["pi.usage"] as UsageState | undefined) ?? {models: {}, tools: {}},
    ...(runStart === undefined ? {} : {runStart}),
    context: contextUsage,
  };
}
