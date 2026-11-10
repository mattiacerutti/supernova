import type {EntryRecord} from "@earendil-works/pi-durable";
import type {AssistantMessage, Message} from "@earendil-works/pi-ai";
import {calculateContextTokens, estimateTokens} from "@earendil-works/pi-coding-agent";
import type {ChatContextUsage} from "@supernova/contracts/services/chat/schemas";

type ContextMessage = Parameters<typeof estimateTokens>[0];

function hasValidAssistantUsage(message: Message): message is AssistantMessage {
  return message.role === "assistant" && message.stopReason !== "aborted" && message.stopReason !== "error" && calculateContextTokens(message.usage) > 0;
}

export function estimateContextUsage(input: {readonly contextWindow: number; readonly messages: readonly Message[]; readonly unknown: boolean}): ChatContextUsage {
  const {contextWindow} = input;
  // The old SDK left the system prompt out of its estimate.
  const messages = input.messages.filter((message) => message.role !== "system");
  // After a compaction, every older usage measured the larger context.
  if (input.unknown) return {contextWindow, usedTokens: null};
  const index = messages.findLastIndex(hasValidAssistantUsage);
  const estimate = (from: number) => messages.slice(from).reduce((total, message) => total + estimateTokens(message as ContextMessage), 0);
  if (index === -1) return {contextWindow, usedTokens: estimate(0)};
  return {contextWindow, usedTokens: calculateContextTokens((messages[index] as AssistantMessage).usage) + estimate(index + 1)};
}

export function contextUsage(input: {readonly entries: readonly EntryRecord[]; readonly messages: readonly Message[]; readonly contextWindow: number}): ChatContextUsage {
  const {contextWindow, entries, messages} = input;
  // The head marker is first; entries it keeps follow it but precede it in history, so only later ones count.
  const head = entries[0];
  const startsAtCompaction = head?.kind === "pi.compaction";
  const respondedAfter = entries.some((entry) => head !== undefined && entry.id > head.id && entry.kind === "pi.assistant" && (entry.model ?? []).some(hasValidAssistantUsage));
  return estimateContextUsage({contextWindow, messages, unknown: startsAtCompaction && !respondedAfter});
}
