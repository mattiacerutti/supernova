import type {AgentState, EntryRecord, LiveState, UsageState} from "@earendil-works/pi-durable";
import type {AssistantMessage, Message} from "@earendil-works/pi-ai";
import {calculateContextTokens, estimateTokens} from "@earendil-works/pi-coding-agent";
import type {HistorySide} from "@supernova/contracts/services/session-runtime/procedures";
import type {Session, SessionContextUsage, SessionEntries, SessionEntry} from "@supernova/contracts/services/sessions/schemas";
import type {SessionRecord, TurnRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";

type ContextMessage = Parameters<typeof estimateTokens>[0];

const PAGE_TURNS = 20;
/** A page always holds at least one whole turn; one over the 16 MiB frame limit still cannot be sent. */
const PAGE_SIZE = 2 * 1024 * 1024;

const entrySizes = new WeakMap<EntryRecord, number>();

function entrySize(entry: EntryRecord): number {
  let size = entrySizes.get(entry);
  if (size === undefined) {
    size = JSON.stringify(entry).length;
    entrySizes.set(entry, size);
  }
  return size;
}

function hasValidAssistantUsage(message: Message): message is AssistantMessage {
  return message.role === "assistant" && message.stopReason !== "aborted" && message.stopReason !== "error" && calculateContextTokens(message.usage) > 0;
}

function authoredEntries(entries: readonly EntryRecord[], turns: Readonly<Record<string, TurnRecord>>): SessionEntry[] {
  return entries.map((entry) => {
    const record = entry.kind === "pi.user" ? turns[String(entry.id)] : undefined;
    return record ? {...entry, contentParts: record.contentParts} : entry;
  });
}

/** `unknown` after a compaction: every older usage measured the pre-compaction context. */
export function buildSessionContextUsage(input: {readonly contextWindow: number; readonly messages: readonly Message[]; readonly unknown: boolean}): SessionContextUsage {
  const {contextWindow} = input;
  // The old SDK's context had no system prompt; estimates keep leaving it out so the displayed usage is unchanged.
  const messages = input.messages.filter((message) => message.role !== "system");
  if (input.unknown) return {contextWindow, usedTokens: null};
  const index = messages.findLastIndex(hasValidAssistantUsage);
  const estimate = (from: number) => messages.slice(from).reduce((total, message) => total + estimateTokens(message as ContextMessage), 0);
  if (index === -1) return {contextWindow, usedTokens: estimate(0)};
  return {contextWindow, usedTokens: calculateContextTokens((messages[index] as AssistantMessage).usage) + estimate(index + 1)};
}

export function contextUsageOf(input: {readonly entries: readonly EntryRecord[]; readonly messages: readonly Message[]; readonly contextWindow: number}): Session["context"] {
  const {contextWindow, entries, messages} = input;
  // The head marker is first; entries it keeps follow it but precede it in history, so only later ones count.
  const head = entries[0];
  const startsAtCompaction = head?.kind === "pi.compaction";
  const respondedAfter = entries.some((entry) => head !== undefined && entry.id > head.id && entry.kind === "pi.assistant" && (entry.model ?? []).some(hasValidAssistantUsage));
  return buildSessionContextUsage({contextWindow, messages, unknown: startsAtCompaction && !respondedAfter});
}

/** Read from the leaf outwards. The page reaching the far end also holds what precedes the first turn. */
export function entriesPage(input: {readonly side: HistorySide; readonly entries: readonly EntryRecord[]; readonly turns: Readonly<Record<string, TurnRecord>>}): SessionEntries {
  const {side, entries, turns} = input;

  const starts = entries.flatMap((entry, index) => (entry.kind === "pi.user" && turns[String(entry.id)] ? [index] : []));
  const bounds = [...starts, entries.length];
  const sizes = starts.map((turnStart, index) => entries.slice(turnStart, bounds[index + 1]).reduce((total, entry) => total + entrySize(entry), 0));

  const pageTurnCount = (sizes: readonly number[]) => {
    let count = 0;
    let size = 0;
    for (const turnSize of sizes) {
      if (count > 0 && (count === PAGE_TURNS || size + turnSize > PAGE_SIZE)) break;
      size += turnSize;
      count += 1;
    }
    return count;
  };

  const count = pageTurnCount(side === "entries" ? sizes.toReversed() : sizes);
  const remaining = starts.length - count;
  const items = remaining === 0 ? entries : side === "entries" ? entries.slice(starts[remaining]) : entries.slice(0, starts[count]);
  return {items: authoredEntries(items, turns), remaining};
}

export function timelineEntries(history: readonly EntryRecord[]): EntryRecord[] {
  return history.filter((entry) => entry.kind !== "pi.system");
}

/** Strict JSON: the session is diffed into Chord deltas, so optional fields are left out, never `undefined`. */
export function buildSession(input: {
  readonly record: SessionRecord;
  readonly history: readonly EntryRecord[];
  readonly undone: readonly EntryRecord[];
  readonly agent: AgentState | undefined;
  readonly live: LiveState | undefined;
  readonly usage: UsageState | undefined;
  readonly runStart: number | undefined;
  readonly turns: Readonly<Record<string, TurnRecord>>;
  readonly context: Session["context"];
}): Session {
  const {context, record, runStart, turns} = input;
  const entries = entriesPage({side: "entries", entries: input.history, turns});
  const undone = entriesPage({side: "undone", entries: input.undone, turns});
  // Activity stops at the live turn's user message so a running session does not keep climbing the sidebar.
  const liveStart = runStart === undefined ? -1 : entries.items.findIndex((entry) => entry.id >= runStart);
  const settled = liveStart === -1 ? entries.items : entries.items.slice(0, liveStart + 1);
  const lastTimestamp = settled.findLast((entry) => entry.model?.[0]?.timestamp !== undefined)?.model?.[0]?.timestamp;
  return {
    id: record.id,
    title: record.title ?? "Untitled session",
    forked: record.forkedFrom !== undefined,
    pinned: record.pinned,
    projectPath: record.projectPath,
    ...(record.worktree ? {worktree: record.worktree} : {}),
    updatedAt: lastTimestamp !== undefined && new Date(lastTimestamp).toISOString() > record.updatedAt ? new Date(lastTimestamp).toISOString() : record.updatedAt,
    entries,
    undone,
    agent: input.agent ?? {},
    live: input.live ?? {},
    usage: input.usage ?? {models: {}, tools: {}},
    ...(runStart === undefined ? {} : {runStart}),
    context,
  };
}
