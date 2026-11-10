import type {AgentState, ConversationView, EntryRecord, LiveState, UsageState} from "@earendil-works/pi-durable";
import type {ChatContextUsage, ChatDocument} from "@supernova/contracts/services/chat/schemas";
import type {SessionRecord, SessionState, TurnRecord} from "@supernova/agent-runtime/core/session-state";
import {turnPositions} from "@supernova/agent-runtime/core/session-state";
import {historyPage} from "@supernova/agent-runtime/features/chat/lib/transcript/history-page";

export interface BranchEntries {
  readonly branch: number;
  readonly entries: readonly EntryRecord[];
}

export function undoPointKey(state: SessionState, branchEntries: BranchEntries): string {
  // With nothing undone, the undo point is the newest entry, so it moves as the branch grows.
  return `${state.branch}:${state.leaf}:${branchEntries.entries.at(-1)?.id}`;
}

export function entriesUpToUndoPoint(entries: readonly EntryRecord[], leaf: number | null | undefined): readonly EntryRecord[] {
  return leaf === undefined ? entries : entries.filter((entry) => leaf !== null && entry.id <= leaf);
}

export function withoutSystemEntries(entries: readonly EntryRecord[]): EntryRecord[] {
  return entries.filter((entry) => entry.kind !== "pi.system");
}

export function appendViewEntries(cached: BranchEntries | undefined, view: ConversationView): BranchEntries | undefined {
  const branch = view.conversation.id;
  const inherited = cachedEntriesFor(cached, view);

  const lastId = inherited?.at(-1)?.id ?? 0;
  // Durable's view starts past the cache: the entries between need a storage read.
  if (view.before !== undefined && (!inherited || view.before > lastId)) return undefined;

  const added = withoutSystemEntries(view.entries.filter((entry) => entry.id > lastId));
  if (added.length === 0) return cached?.branch === branch ? cached : {branch, entries: inherited ?? []};
  return {branch, entries: [...(inherited ?? []), ...added]};
}

export function cachedEntriesFor(cached: BranchEntries | undefined, view: ConversationView): readonly EntryRecord[] | undefined {
  const parent = view.conversation.parent;
  if (cached?.branch === view.conversation.id) return cached.entries;
  // A fork starts with its parent's entries up to the fork point.
  if (cached && parent?.conversationId === cached.branch) return cached.entries.filter((entry) => entry.id <= parent.at);
  return undefined;
}

function lastCopiedTurnId(entries: readonly EntryRecord[], turns: Readonly<Record<string, TurnRecord>>, sessionId: string): string | undefined {
  return turnPositions(entries, turns).findLast((turn) => turn.record.before.sessionId !== sessionId)?.turnId;
}

export function chatDocument(input: {
  readonly record: Pick<SessionRecord, "id" | "forkedFrom" | "updatedAt">;
  readonly view: ConversationView;
  readonly branchEntries: BranchEntries;
  readonly state: SessionState;
  readonly agentState: AgentState | undefined;
  readonly contextUsage: ChatContextUsage;
}): ChatDocument {
  const {agentState, branchEntries, contextUsage, record, state, view} = input;
  const {turns} = state;
  const active = entriesUpToUndoPoint(branchEntries.entries, state.leaf);
  const live = view.docs["pi.live"] as LiveState | undefined;
  const runStart = live?.run?.first;

  const entries = historyPage({side: "entries", entries: active, turns});
  const undone = historyPage({side: "undone", entries: branchEntries.entries.slice(active.length), turns, precedingEntryId: active.at(-1)?.id});
  const copiedTurnId = record.forkedFrom !== undefined ? lastCopiedTurnId(active, turns, record.id) : undefined;

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
    // With nothing undone, the view's agent state is from this commit; the one read for the undo point may lag.
    agent: (state.leaf === undefined ? (view.docs["pi.agent"] as AgentState | undefined) : agentState) ?? {},
    live: live ?? {},
    usage: (view.docs["pi.usage"] as UsageState | undefined) ?? {models: {}, tools: {}},
    ...(runStart === undefined ? {} : {runStart}),
    context: contextUsage,
  };
}
