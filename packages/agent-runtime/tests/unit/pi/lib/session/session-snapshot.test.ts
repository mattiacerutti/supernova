import {estimateTokens} from "@earendil-works/pi-coding-agent";
import type {AssistantMessage, Message, Usage} from "@earendil-works/pi-ai";
import type {EntryRecord} from "@earendil-works/pi-durable";
import type {TurnRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {Session} from "@supernova/contracts/services/sessions/schemas";
import {describe, expect, it} from "vitest";
import {buildSession, buildSessionContextUsage, entriesPage} from "@supernova/agent-runtime/pi/lib/session/session-snapshot";

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
      history: [authored, continuation],
      undone: [undone],
      agent: undefined,
      live: undefined,
      usage: undefined,
      runStart: undefined,
      turns,
      context: {contextWindow: 0, usedTokens: 0},
    });

    expect(session.entries.items[0]).toMatchObject({contentParts: [{type: "text", text: "Original input"}], model: authored.model});
    expect(session.entries.items[1]).toBe(continuation);
    expect(session.undone.items[0]).toMatchObject({contentParts: []});
    expect(session).not.toHaveProperty("turns");
    expect(session.entries.items[0]).not.toHaveProperty("before");
    expect(authored).not.toHaveProperty("contentParts");
    expect(undone).not.toHaveProperty("contentParts");
    expect(session.title).toBe("Untitled session");
    expect(Session.parse(session)).toEqual(session);
    expect(Session.safeParse({...session, entries: {items: [{...authored, contentParts: [{type: "text", text: 1}]}], remaining: 0}}).success).toBe(false);
  });
});

describe("session activity", () => {
  const entry = (id: number, kind: string, timestamp: number): EntryRecord =>
    ({id, conversationId: 1, kind, model: [{role: kind === "pi.user" ? "user" : "assistant", content: "", timestamp}]}) as unknown as EntryRecord;
  const turns: Record<string, TurnRecord> = {
    "1": {contentParts: [], capture: false, before: {checkpointId: "c", sessionId: "s", status: "disabled"}},
    "3": {contentParts: [], capture: false, before: {checkpointId: "c", sessionId: "s", status: "disabled"}},
  };
  const history = [entry(1, "pi.user", 1_000), entry(2, "pi.assistant", 2_000), entry(3, "pi.user", 3_000), entry(4, "pi.assistant", 4_000)];
  const session = (runStart: number | undefined) =>
    buildSession({
      record: {id: "s", projectPath: "/project", pinned: false, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString()},
      history,
      undone: [],
      agent: undefined,
      live: undefined,
      usage: undefined,
      runStart,
      turns,
      context: {contextWindow: 0, usedTokens: 0},
    });

  it("is the newest entry once every turn has settled", () => {
    expect(session(undefined).updatedAt).toBe(new Date(4_000).toISOString());
  });

  it("stops at the live turn's user message while its run answers it", () => {
    expect(session(3).updatedAt).toBe(new Date(3_000).toISOString());
  });
});

describe("history pages", () => {
  const record = (): TurnRecord => ({contentParts: [], capture: false, before: {checkpointId: "c", sessionId: "s", status: "disabled"}});
  const entry = (id: number, kind: string, text = ""): EntryRecord =>
    ({id, conversationId: 1, kind, model: [{role: kind === "pi.user" ? "user" : "assistant", content: text, timestamp: id}]}) as unknown as EntryRecord;
  /** A history of `count` turns: a user entry with a turn record and an answer each, after a leading compaction. */
  const history = (count: number, answer = "") => {
    const entries = [entry(1, "pi.compaction")];
    const turns: Record<string, TurnRecord> = {};
    for (let turn = 0; turn < count; turn++) {
      const id = 2 + turn * 3;
      turns[String(id)] = record();
      // An extension's continuation has no record, so it belongs to the turn before it.
      entries.push(entry(id, "pi.user"), entry(id + 1, "pi.assistant", answer), entry(id + 2, "pi.user"));
    }
    return {history: entries, turns};
  };
  const turnStarts = (entries: readonly EntryRecord[], turns: Record<string, TurnRecord>) => entries.filter((entry) => turns[String(entry.id)]).map((entry) => entry.id);

  it("holds the newest twenty whole turns, and the start of history once it reaches the first", () => {
    const {history: entries, turns} = history(45);

    const shown = (end: number) => entriesPage({side: "entries", entries: entries.slice(0, end), turns});
    const newest = shown(entries.length);
    expect(newest.remaining).toBe(25);
    expect(turnStarts(newest.items, turns)).toHaveLength(20);
    expect(newest.items[0]?.id).toBe(2 + 25 * 3);
    expect(newest.items.at(-1)).toBe(entries.at(-1));

    const middle = shown(entries.findIndex((candidate) => candidate.id === newest.items[0]!.id));
    expect(middle.remaining).toBe(5);
    expect(middle.items.at(-1)?.id).toBe(newest.items[0]!.id - 1);

    const first = shown(entries.findIndex((candidate) => candidate.id === middle.items[0]!.id));
    expect(first.remaining).toBe(0);
    // The leading compaction comes with the first turn.
    expect(first.items[0]).toBe(entries[0]);
    expect(turnStarts(first.items, turns)).toHaveLength(5);
  });

  it("stops at two megabytes, but always holds one whole turn", () => {
    const {history: entries, turns} = history(4, "x".repeat(900_000));

    expect(entriesPage({side: "entries", entries, turns}).remaining).toBe(2);
    const huge = history(3, "x".repeat(5_000_000));
    const page = entriesPage({side: "entries", entries: huge.history, turns: huge.turns});
    expect(page.remaining).toBe(2);
    expect(turnStarts(page.items, huge.turns)).toHaveLength(1);
  });

  it("pages undone turns from the leaf forward, with the continuation before the first", () => {
    const {history: entries, turns} = history(25);
    // Undone from the second turn on; the first turn's trailing continuation (no record) leads the undone entries.
    const undone = entries.slice(3);
    expect(turns[String(undone[0]!.id)]).toBeUndefined();

    const page = entriesPage({side: "undone", entries: undone, turns});
    expect(page.remaining).toBe(4);
    expect(page.items[0]?.id).toBe(undone[0]!.id);
    expect(turnStarts(page.items, turns)).toHaveLength(20);
    expect(entriesPage({side: "undone", entries: entries.slice(-6), turns})).toMatchObject({remaining: 0});
    expect(entriesPage({side: "undone", entries: entries.slice(-6), turns}).items).toHaveLength(6);
    expect(entriesPage({side: "undone", entries: [], turns})).toEqual({items: [], remaining: 0});
  });

  it("is the whole history when it has no turns", () => {
    const entries = [entry(1, "pi.compaction"), entry(2, "pi.user")];
    expect(entriesPage({side: "entries", entries, turns: {}})).toEqual({items: entries, remaining: 0});
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
