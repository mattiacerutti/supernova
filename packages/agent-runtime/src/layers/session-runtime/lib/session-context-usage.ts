import type {AgentSession, SessionEntry} from "@earendil-works/pi-coding-agent";
import {calculateContextTokens, estimateTokens} from "@earendil-works/pi-coding-agent";
import type {AssistantMessage, Usage} from "@earendil-works/pi-ai";
import type {SessionContextUsage} from "@supernova/contracts/sessions/schemas";

export type PiAgentMessage = AgentSession["messages"][number];

function isSuccessfulAssistantMessage(message: PiAgentMessage): message is AssistantMessage {
  return message.role === "assistant" && message.stopReason !== "aborted" && message.stopReason !== "error";
}

function findLatestCompactionIndex(entries: readonly SessionEntry[]): number {
  for (let index = entries.length - 1; index >= 0; index--) {
    if (entries[index]?.type === "compaction") return index;
  }

  return -1;
}

function hasPostCompactionUsage(entries: readonly SessionEntry[], compactionIndex: number): boolean {
  for (let index = entries.length - 1; index > compactionIndex; index--) {
    const entry = entries[index];
    if (entry?.type !== "message" || entry.message.role !== "assistant") continue;
    if (!isSuccessfulAssistantMessage(entry.message)) return false;
    return calculateContextTokens(entry.message.usage) > 0;
  }

  return false;
}

function findLatestAssistantUsage(messages: readonly PiAgentMessage[]): {readonly index: number; readonly usage: Usage} | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message || !isSuccessfulAssistantMessage(message)) continue;
    return {index, usage: message.usage};
  }

  return undefined;
}

/** Estimates the active session context using Pi provider usage when it is safe to reuse. */
export function buildSessionContextUsage(input: {
  readonly contextWindow: number;
  readonly entries: readonly SessionEntry[];
  readonly messages: readonly PiAgentMessage[];
}): SessionContextUsage {
  const compactionIndex = findLatestCompactionIndex(input.entries);

  // After compaction, the last assistant usage reflects pre-compaction context size.
  // We can only trust usage from an assistant that responded after the latest compaction.
  // If no such assistant exists, context token count is unknown until the next LLM response.
  if (compactionIndex >= 0 && !hasPostCompactionUsage(input.entries, compactionIndex)) {
    return {contextWindow: input.contextWindow, usedTokens: null};
  }

  const usageInfo = findLatestAssistantUsage(input.messages);

  if (!usageInfo) {
    return {
      contextWindow: input.contextWindow,
      usedTokens: input.messages.reduce((total, message) => total + estimateTokens(message), 0),
    };
  }

  const trailingTokens = input.messages.slice(usageInfo.index + 1).reduce((total, message) => total + estimateTokens(message), 0);

  return {
    contextWindow: input.contextWindow,
    usedTokens: calculateContextTokens(usageInfo.usage) + trailingTokens,
  };
}
