import {estimateTokens} from "@earendil-works/pi-coding-agent";
import type {AssistantMessage, Message, Usage} from "@earendil-works/pi-ai";
import type {EntryRecord} from "@earendil-works/pi-durable";
import type {TurnRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {Session} from "@supernova/contracts/services/sessions/schemas";
import {describe, expect, it} from "vitest";
import {buildSession, buildSessionContextUsage} from "@supernova/agent-runtime/pi/lib/session/session-snapshot";

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

describe("session entries", () => {
  it("attaches authored content to visible and undone user entries without changing Pi entries or exposing checkpoints", () => {
    const user = (id: number): EntryRecord =>
      ({id, conversationId: 1, kind: "pi.user", model: [{role: "user", content: "Expanded prompt", timestamp: 0}]}) as unknown as EntryRecord;
    const authored = user(1);
    const continuation = user(2);
    const undone = user(3);
    const turns: Record<string, TurnRecord> = {
      "1": {contentParts: [{type: "text", text: "Original input"}], capture: true, before: {checkpointId: "private", sessionId: "s", status: "captured"}},
      "3": {contentParts: [], capture: false, before: {checkpointId: "undone", sessionId: "s", status: "disabled"}},
    };
    const session = buildSession({
      record: {id: "s", projectPath: "/project", pinned: false, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString()},
      entries: [authored, continuation],
      undone: [undone],
      agent: undefined,
      live: undefined,
      usage: undefined,
      runStart: undefined,
      turns,
      context: {contextWindow: 0, usedTokens: 0},
    });

    expect(session.entries[0]).toMatchObject({contentParts: [{type: "text", text: "Original input"}], model: authored.model});
    expect(session.entries[1]).toBe(continuation);
    expect(session.undone[0]).toMatchObject({contentParts: []});
    expect(session).not.toHaveProperty("turns");
    expect(session.entries[0]).not.toHaveProperty("before");
    expect(authored).not.toHaveProperty("contentParts");
    expect(undone).not.toHaveProperty("contentParts");
    expect(session.title).toBe("Untitled session");
    expect(Session.parse(session)).toEqual(session);
    expect(Session.safeParse({...session, entries: [{...authored, contentParts: [{type: "text", text: 1}]}]}).success).toBe(false);
  });
});

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
