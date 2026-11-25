import {compile} from "@earendil-works/pi-schema";
import {estimateTokens} from "@earendil-works/pi-coding-agent";
import type {AssistantMessage, Message, Usage} from "@earendil-works/pi-ai";
import type {EntryRecord} from "@earendil-works/pi-durable";
import {ChatDocument, USER_ENTRY_KIND} from "@supernova/contracts/services/chat/schemas";
import {describe, expect, it} from "vitest";
import type {ConversationId, ConversationView} from "@earendil-works/pi-durable";
import type {SessionState} from "@supernova/agent-runtime/core/session-state";
import {chatDocument} from "@supernova/agent-runtime/features/chat/lib/transcript/chat-document";
import {estimateContextUsage} from "@supernova/agent-runtime/features/chat/lib/transcript/context-usage";
import {historyPage} from "@supernova/agent-runtime/features/chat/lib/transcript/history-page";

function turnEntry(id: number, turnIndex: number, text = ""): EntryRecord {
  const data = {contentParts: [{type: "text", text}], turnIndex};
  return {id, conversationId: 1, kind: USER_ENTRY_KIND, model: [{role: "user", content: text, timestamp: id}], data} as unknown as EntryRecord;
}

/** The document of a conversation whose entries before the undo point are `history` and after it `undone`, with a run from `runStart`. */
function buildSession(input: {
  readonly record: {readonly id: string};
  readonly history: readonly EntryRecord[];
  readonly undone: readonly EntryRecord[];
  readonly runStart: number | undefined;
}) {
  const live = input.runStart === undefined ? {} : {run: {first: input.runStart}};
  // With undone turns, the current conversation (2) ends at the last shown entry, and they are on conversation 1.
  const undone = input.undone.length > 0;
  const view = {conversation: {id: undone ? 2 : 1}, entries: input.history, docs: {"pi.live": live}} as unknown as ConversationView;
  const state: SessionState = {conversation: (undone ? 2 : 1) as ConversationId, ...(undone ? {redoConversation: 1 as ConversationId} : {}), forks: {}, checkpoints: {}};
  return chatDocument({record: input.record, view, undone: input.undone, state, contextUsage: {contextWindow: 0, usedTokens: 0}});
}

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
  it("passes Pi's entries through as they are, without the session's checkpoints", () => {
    const authored = turnEntry(1, 0, "Original input");
    // An extension's continuation is Pi's own user entry, so it belongs to the turn before it.
    const continuation = {id: 2, conversationId: 1, kind: "pi.user", model: [{role: "user", content: "Continue", timestamp: 0}]} as unknown as EntryRecord;
    const undone = turnEntry(3, 1);
    const session = buildSession({record: {id: "s"}, history: [authored, continuation], undone: [undone], runStart: undefined});

    expect(session.entries.items).toEqual([authored, continuation]);
    expect(session.entries.items[0]).toBe(authored);
    expect(session.undone.items).toEqual([undone]);
    expect(session.undone.precedingEntryId).toBe(continuation.id);
    expect(session).not.toHaveProperty("checkpoints");
    expect(session).not.toHaveProperty("title");
    expect(compile(ChatDocument).errors(session)).toEqual([]);
  });
});

describe("history pages", () => {
  const entry = (id: number, kind: string, text = ""): EntryRecord =>
    ({id, conversationId: 1, kind, model: [{role: kind === "pi.user" ? "user" : "assistant", content: text, timestamp: id}]}) as unknown as EntryRecord;
  const history = (count: number, answer = "") => {
    const entries = [entry(1, "pi.compaction")];
    for (let turn = 0; turn < count; turn++) {
      const id = 2 + turn * 3;
      // An extension's continuation is Pi's own user entry, so it belongs to the turn before it.
      entries.push(turnEntry(id, turn), entry(id + 1, "pi.assistant", answer), entry(id + 2, "pi.user"));
    }
    return {history: entries, lastTurnIndex: count - 1};
  };
  const turnStarts = (entries: readonly EntryRecord[]) => entries.filter((entry) => entry.kind === USER_ENTRY_KIND).map((entry) => entry.id);

  it("holds the newest twenty whole turns, and the start of history once it reaches the first", () => {
    const {history: entries} = history(45);

    const shown = (end: number) => historyPage({side: "entries", entries: entries.slice(0, end)});
    const newest = shown(entries.length);
    expect(newest.remaining).toBe(25);
    expect(turnStarts(newest.items)).toHaveLength(20);
    expect(newest.items[0]?.id).toBe(2 + 25 * 3);
    expect(newest.items.at(-1)).toBe(entries.at(-1));
    expect(newest.precedingEntryId).toBe(entries[entries.findIndex((entry) => entry.id === newest.items[0]!.id) - 1]?.id);

    const middle = shown(entries.findIndex((candidate) => candidate.id === newest.items[0]!.id));
    expect(middle.remaining).toBe(5);
    expect(middle.items.at(-1)?.id).toBe(newest.precedingEntryId);

    const first = shown(entries.findIndex((candidate) => candidate.id === middle.items[0]!.id));
    expect(first.remaining).toBe(0);
    expect(first.precedingEntryId).toBeNull();
    // The leading compaction comes with the first turn.
    expect(first.items[0]).toBe(entries[0]);
    expect(turnStarts(first.items)).toHaveLength(5);
  });

  it("stops at two megabytes, but always holds one whole turn", () => {
    const {history: entries} = history(4, "x".repeat(900_000));

    expect(historyPage({side: "entries", entries}).remaining).toBe(2);
    const huge = history(3, "x".repeat(5_000_000));
    const page = historyPage({side: "entries", entries: huge.history});
    expect(page.remaining).toBe(2);
    expect(turnStarts(page.items)).toHaveLength(1);
  });

  it("connects a new turn to the oversized turn excluded from its window", () => {
    const {history: entries} = history(1, "x".repeat(6 * 1024 * 1024));
    const before = historyPage({side: "entries", entries});
    const nextUser = turnEntry(10, 1);

    const after = historyPage({side: "entries", entries: [...entries, nextUser]});

    expect(before.items).toHaveLength(entries.length);
    expect(after.items.map((entry) => entry.id)).toEqual([10]);
    expect(after).toMatchObject({remaining: 1, precedingEntryId: entries.at(-1)!.id});
  });

  it("pages undone turns from the undo point forward, with the continuation before the first", () => {
    const {history: entries, lastTurnIndex} = history(25);
    // Undone from the second turn on; the first turn's trailing continuation leads the undone entries.
    const undone = entries.slice(3);
    expect(undone[0]!.kind).toBe("pi.user");

    const page = historyPage({side: "undone", entries: undone, lastTurnIndex, precedingEntryId: entries[2]!.id});
    expect(page.remaining).toBe(4);
    expect(page.precedingEntryId).toBe(entries[2]!.id);
    expect(page.items[0]?.id).toBe(undone[0]!.id);
    expect(turnStarts(page.items)).toHaveLength(20);
    expect(historyPage({side: "undone", entries: entries.slice(-6), lastTurnIndex})).toMatchObject({remaining: 0});
    expect(historyPage({side: "undone", entries: entries.slice(-6), lastTurnIndex}).items).toHaveLength(6);
    const edge = page.items.at(-1)!.id;
    const next = historyPage({side: "undone", entries: undone.slice(undone.findIndex((entry) => entry.id === edge) + 1), lastTurnIndex, precedingEntryId: edge});
    expect(next).toMatchObject({remaining: 0, precedingEntryId: edge});
    expect(historyPage({side: "undone", entries: [], lastTurnIndex, precedingEntryId: edge})).toEqual({items: [], remaining: 0, precedingEntryId: null});
  });

  it("is the whole history when it has no turns", () => {
    const entries = [entry(1, "pi.compaction"), entry(2, "pi.user")];
    expect(historyPage({side: "entries", entries})).toEqual({items: entries, remaining: 0, precedingEntryId: null});
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
    expect(estimateContextUsage({contextWindow: 200_000, messages, unknown: unknown ?? false})).toEqual({contextWindow: 200_000, usedTokens: expected});
  });
});
