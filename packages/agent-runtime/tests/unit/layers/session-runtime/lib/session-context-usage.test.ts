import type {SessionEntry} from "@earendil-works/pi-coding-agent";
import {estimateTokens} from "@earendil-works/pi-coding-agent";
import type {Usage} from "@earendil-works/pi-ai";
import {describe, expect, it} from "vitest";
import {buildSessionContextUsage} from "@supernova/agent-runtime/layers/session-runtime/lib/session-context-usage";
import type {PiAgentMessage} from "@supernova/agent-runtime/layers/session-runtime/lib/session-context-usage";
import {messageEntry, piAgentMessage, userMessage} from "@tests/support/layers/pi-session-test-utils";

function usage(totalTokens: number): Usage {
  return {
    cacheRead: 0,
    cacheWrite: 0,
    cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0},
    input: totalTokens,
    output: 0,
    totalTokens,
  };
}

function assistantMessage(totalTokens: number, stopReason: "aborted" | "error" | "stop" = "stop"): PiAgentMessage {
  return piAgentMessage({
    api: "anthropic-messages",
    content: [{text: "Response", type: "text"}],
    model: "claude-sonnet",
    provider: "anthropic",
    role: "assistant",
    stopReason,
    timestamp: 2,
    usage: usage(totalTokens),
  });
}

function compactionEntry(parentId: string | null = null): SessionEntry {
  return {
    firstKeptEntryId: "kept-entry",
    id: "compaction-entry",
    parentId,
    summary: "Compacted context",
    timestamp: "2026-01-01T00:00:00.000Z",
    tokensBefore: 100_000,
    type: "compaction",
  };
}

describe("session context usage", () => {
  const validAssistant = assistantMessage(12_000);
  const zeroUsageAssistant = assistantMessage(0);
  const abortedAssistant = assistantMessage(0, "aborted");
  const request = userMessage("Continue", 3);

  const cases: ReadonlyArray<{
    readonly entries: readonly SessionEntry[];
    readonly expected: number | null;
    readonly messages: readonly PiAgentMessage[];
    readonly name: string;
  }> = [
    {
      entries: [],
      expected: estimateTokens(request),
      messages: [request],
      name: "estimates messages before the first provider measurement",
    },
    {
      entries: [messageEntry(validAssistant)],
      expected: 12_000,
      messages: [validAssistant],
      name: "uses valid provider usage",
    },
    {
      entries: [messageEntry(validAssistant), messageEntry(zeroUsageAssistant, {id: "zero-entry", parentId: "assistant-entry"})],
      expected: 12_000 + estimateTokens(zeroUsageAssistant),
      messages: [validAssistant, zeroUsageAssistant],
      name: "ignores a successful all-zero usage response",
    },
    {
      entries: [compactionEntry()],
      expected: null,
      messages: [piAgentMessage({role: "compactionSummary", summary: "Compacted context", timestamp: 1, tokensBefore: 100_000})],
      name: "reports unknown immediately after compaction",
    },
    {
      entries: [
        compactionEntry(),
        messageEntry(validAssistant, {id: "valid-entry", parentId: "compaction-entry"}),
        messageEntry(abortedAssistant, {id: "aborted-entry", parentId: "valid-entry"}),
      ],
      expected: 12_000 + estimateTokens(abortedAssistant),
      messages: [validAssistant, abortedAssistant],
      name: "retains valid post-compaction usage after an aborted response",
    },
  ];

  it.each(cases)("$name", ({entries, expected, messages}) => {
    expect(buildSessionContextUsage({contextWindow: 200_000, entries, messages})).toEqual({contextWindow: 200_000, usedTokens: expected});
  });
});
