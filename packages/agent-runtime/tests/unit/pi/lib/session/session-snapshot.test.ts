import {estimateTokens} from "@earendil-works/pi-coding-agent";
import type {AssistantMessage, Message, Usage} from "@earendil-works/pi-ai";
import {describe, expect, it} from "vitest";
import {buildSessionContextUsage} from "@supernova/agent-runtime/pi/lib/session/session-snapshot";

function usage(totalTokens: number): Usage {
  return {cacheRead: 0, cacheWrite: 0, cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0}, input: totalTokens, output: 0, totalTokens};
}

function assistantMessage(totalTokens: number, stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage {
  return {
    api: "anthropic-messages",
    content: [{text: "Response", type: "text"}],
    model: "claude-sonnet",
    provider: "anthropic",
    role: "assistant",
    stopReason,
    timestamp: 2,
    usage: usage(totalTokens),
  };
}

const estimate = (message: Message) => estimateTokens(message as Parameters<typeof estimateTokens>[0]);

describe("session context usage", () => {
  const validAssistant = assistantMessage(12_000);
  const zeroUsageAssistant = assistantMessage(0);
  const abortedAssistant = assistantMessage(0, "aborted");
  const request: Message = {content: [{text: "Continue", type: "text"}], role: "user", timestamp: 3};
  const system: Message = {content: "", role: "system", sections: {preamble: "x".repeat(4_000)}, timestamp: 0};

  const cases: ReadonlyArray<{readonly expected: number | null; readonly messages: readonly Message[]; readonly name: string; readonly unknown?: boolean}> = [
    {expected: estimate(request), messages: [request], name: "estimates messages before the first provider measurement"},
    {expected: estimate(request), messages: [system, request], name: "leaves the system prompt out of estimates, as the old SDK's context did"},
    {expected: 12_000, messages: [validAssistant], name: "uses valid provider usage"},
    {expected: 12_000 + estimate(zeroUsageAssistant), messages: [validAssistant, zeroUsageAssistant], name: "ignores a successful all-zero usage response"},
    {expected: null, messages: [request], name: "reports unknown after compaction until a response measures it", unknown: true},
    {expected: 12_000 + estimate(abortedAssistant), messages: [validAssistant, abortedAssistant], name: "retains valid usage after an aborted response"},
  ];

  it.each(cases)("$name", ({expected, messages, unknown}) => {
    expect(buildSessionContextUsage({contextWindow: 200_000, messages, unknown: unknown ?? false})).toEqual({contextWindow: 200_000, usedTokens: expected});
  });
});
