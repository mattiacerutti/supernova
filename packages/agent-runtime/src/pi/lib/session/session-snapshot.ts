import type {AgentState, EntryRecord, LiveState, UsageState} from "@earendil-works/pi-durable";
import type {AssistantMessage, Message} from "@earendil-works/pi-ai";
import {calculateContextTokens, estimateTokens} from "@earendil-works/pi-coding-agent";
import type {HistorySide} from "@supernova/contracts/services/session-runtime/procedures";
import type {Session, SessionContextUsage, SessionEntries, SessionEntry} from "@supernova/contracts/services/sessions/schemas";
import type {SessionRecord, TurnRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";

type ContextMessage = Parameters<typeof estimateTokens>[0];

/** The most turns one page holds: either side of the session document's window, or one `loadHistory` read. */
const PAGE_TURNS = 20;
/**
 * The most characters of JSON a page holds, unless its one turn is larger: a page always holds a whole turn. A
 * protocol frame holds 16 MiB, so a single turn larger than that still cannot be sent; revisit if turns that large
 * appear.
 */
const PAGE_SIZE = 2 * 1024 * 1024;

const entrySizes = new WeakMap<EntryRecord, number>();

/** An entry's JSON length, measured once: history entries are cached and never change. */
function entrySize(entry: EntryRecord): number {
  let size = entrySizes.get(entry);
  if (size === undefined) {
    size = JSON.stringify(entry).length;
    entrySizes.set(entry, size);
  }
  return size;
}

/** Whether an assistant message carries provider usage that measured its request's context. */
function hasValidAssistantUsage(message: Message): message is AssistantMessage {
  return message.role === "assistant" && message.stopReason !== "aborted" && message.stopReason !== "error" && calculateContextTokens(message.usage) > 0;
}

function authoredEntries(entries: readonly EntryRecord[], turns: Readonly<Record<string, TurnRecord>>): SessionEntry[] {
  return entries.map((entry) => {
    const record = entry.kind === "pi.user" ? turns[String(entry.id)] : undefined;
    return record ? {...entry, contentParts: record.contentParts} : entry;
  });
}

/**
 * Estimates the active context from the model messages of the next request: the latest provider-reported usage plus an
 * estimate of what came after it. `unknown` is set after a compaction until a later response reports usage, because
 * every older usage measured the pre-compaction context.
 */
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

/**
 * Context usage of the next request. `entries` are the active context's entries, which start at the latest
 * compaction summary when there is one; until a response after it reports usage the count is unknown, because every
 * older usage measured the pre-compaction context.
 */
export function contextUsageOf(input: {readonly entries: readonly EntryRecord[]; readonly messages: readonly Message[]; readonly contextWindow: number}): Session["context"] {
  const {contextWindow, entries, messages} = input;
  // The head marker is first; entries it keeps follow it but precede it in history, so only later ones count.
  const head = entries[0];
  const startsAtCompaction = head?.kind === "pi.compaction";
  const respondedAfter = entries.some((entry) => head !== undefined && entry.id > head.id && entry.kind === "pi.assistant" && (entry.model ?? []).some(hasValidAssistantUsage));
  return buildSessionContextUsage({contextWindow, messages, unknown: startsAtCompaction && !respondedAfter});
}

/**
 * One page of `entries`, a stretch of the branch on one side of the leaf, read from the leaf outwards: for `entries`
 * the newest whole turns (its end), for `undone` the oldest (its start). `remaining` counts the turns left beyond the
 * page. The page that reaches the far end also holds what lies there before the first turn (a leading compaction, an
 * extension's continuation of the turn before).
 */
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

/** The timeline's entries of a history: system prompt entries are model bookkeeping, not something to show. */
export function timelineEntries(history: readonly EntryRecord[]): EntryRecord[] {
  return history.filter((entry) => entry.kind !== "pi.system");
}

/**
 * Builds the contract `Session`, with the newest page of the shown `history` as its entries. Every value must be strict
 * JSON: the session is diffed into Chord deltas, so optional fields are left out rather than set to undefined.
 */
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
  const {context, record, turns} = input;
  const entries = entriesPage({side: "entries", entries: input.history, turns});
  const undone = entriesPage({side: "undone", entries: input.undone, turns});
  const lastTimestamp = entries.items.findLast((entry) => entry.model?.[0]?.timestamp !== undefined)?.model?.[0]?.timestamp;
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
    ...(input.runStart === undefined ? {} : {runStart: input.runStart}),
    context,
  };
}
