import type {AgentState, EntryRecord, LiveState, UsageState} from "@earendil-works/pi-durable";
import type {AssistantMessage, Message} from "@earendil-works/pi-ai";
import {calculateContextTokens, estimateTokens} from "@earendil-works/pi-coding-agent";
import type {Session, SessionContextUsage, SessionEntry} from "@supernova/contracts/services/sessions/schemas";
import type {SessionRecord, TurnRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";

type ContextMessage = Parameters<typeof estimateTokens>[0];

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

/** The timeline's entries of a history: system prompt entries are model bookkeeping, not something to show. */
export function timelineEntries(history: readonly EntryRecord[]): EntryRecord[] {
  return history.filter((entry) => entry.kind !== "pi.system");
}

/**
 * Builds the contract `Session`. Every value must be strict JSON: the session is diffed into Chord deltas, so optional
 * fields are left out rather than set to undefined.
 */
export function buildSession(input: {
  readonly record: SessionRecord;
  readonly entries: readonly EntryRecord[];
  readonly undone: readonly EntryRecord[];
  readonly agent: AgentState | undefined;
  readonly live: LiveState | undefined;
  readonly usage: UsageState | undefined;
  readonly runStart: number | undefined;
  readonly turns: Readonly<Record<string, TurnRecord>>;
  readonly context: Session["context"];
}): Session {
  const {context, record, turns} = input;
  const entries = authoredEntries(input.entries, turns);
  const undone = authoredEntries(input.undone, turns);
  const lastTimestamp = entries.findLast((entry) => entry.model?.[0]?.timestamp !== undefined)?.model?.[0]?.timestamp;
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
