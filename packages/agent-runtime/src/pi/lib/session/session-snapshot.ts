import type {AgentState, EntryRecord} from "@earendil-works/pi-durable";
import type {AssistantMessage, Message} from "@earendil-works/pi-ai";
import {calculateContextTokens, estimateTokens} from "@earendil-works/pi-coding-agent";
import type {ModelReference, Session, SessionContextUsage, Turn} from "@supernova/contracts/sessions/schemas";
import type {SessionRecord, TurnRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {buildTurns} from "@supernova/agent-runtime/pi/lib/turns/build-turns";
import {toTimelineEntries} from "@supernova/agent-runtime/pi/lib/turns/entry-timeline";

type ContextMessage = Parameters<typeof estimateTokens>[0];

/** Whether an assistant message carries provider usage that measured its request's context. */
function hasValidAssistantUsage(message: Message): message is AssistantMessage {
  return message.role === "assistant" && message.stopReason !== "aborted" && message.stopReason !== "error" && calculateContextTokens(message.usage) > 0;
}

/** The first authored text of a session, its title until one is generated or set. */
function fallbackTitle(turns: readonly Turn[]): string {
  const text = turns[0]?.userMessage.contentParts
    .map((part) => (part.type === "text" ? part.text : part.type === "reference" ? part.value : ""))
    .join("")
    .trim();
  return text || "Untitled session";
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

/** The session's model choice as the contract names it, or undefined before its first turn. */
export function modelReferenceOf(agent: AgentState | undefined): ModelReference | undefined {
  const model = agent?.model;
  return model ? {id: model.modelId, providerId: model.provider, thinkingLevel: agent.thinkingLevel ?? "off"} : undefined;
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

/** The session's turns from a history, in order. */
export function turnsOf(history: readonly EntryRecord[], turns: Readonly<Record<string, TurnRecord>>, modelReference: ModelReference): Turn[] {
  return buildTurns(toTimelineEntries(history, turns), modelReference);
}

/** Builds the contract `Session` from its record and already-built turns. */
export function buildSession(input: {
  readonly record: SessionRecord;
  readonly modelReference: ModelReference | undefined;
  readonly turns: readonly Turn[];
  readonly undoneTurns: readonly Turn[];
  readonly context: Session["context"];
}): Session {
  const {context, modelReference, record, turns, undoneTurns} = input;
  const lastTurn = turns.at(-1);
  return {
    id: record.id,
    context,
    forked: record.forkedFrom !== undefined,
    ...(modelReference ? {modelReference} : {}),
    projectPath: record.projectPath,
    ...(record.worktree ? {worktree: record.worktree} : {}),
    title: record.title ?? fallbackTitle(turns),
    turns: [...turns],
    undoneTurns: [...undoneTurns],
    updatedAt: lastTurn?.completedAt ?? lastTurn?.startedAt ?? record.updatedAt,
  };
}
