import type {EntryRecord, LiveState, Session} from "@supernova/contracts/sessions/schemas";
import {describe, expect, it} from "vitest";
import {buildSessionTurns, buildTurns} from "@/features/sessions/lib/timeline/turns/build-turns";

const usage = {cacheRead: 0, cacheWrite: 0, cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0}, input: 0, output: 0, totalTokens: 0};

function user(id: number, text: string, content?: unknown): EntryRecord {
  return {conversationId: 1, id, kind: "pi.user", model: [{content: content ?? text, role: "user", timestamp: id * 1000}]} as unknown as EntryRecord;
}

function assistant(id: number, content: unknown[], extra: Record<string, unknown> = {}): EntryRecord {
  const message = {api: "x", content, model: "m", provider: "p", role: "assistant", stopReason: "stop", timestamp: id * 1000, usage, ...extra};
  return {conversationId: 1, id, kind: "pi.assistant", model: [message]} as unknown as EntryRecord;
}

function toolResult(id: number, callId: string, text: string, isError = false): EntryRecord {
  const message = {content: [{text, type: "text"}], isError, role: "toolResult", timestamp: id * 1000, toolCallId: callId, toolName: "bash"};
  return {conversationId: 1, id, kind: "pi.tool-result", model: [message]} as unknown as EntryRecord;
}

function compaction(id: number, summary: string): EntryRecord {
  const text = `The conversation history before this point was compacted into the following summary:\n\n<summary>\n${summary}\n</summary>`;
  return {conversationId: 1, id, kind: "pi.compaction", model: [{content: text, role: "user", timestamp: id * 1000}]} as unknown as EntryRecord;
}

const turns: Session["turns"] = {"1": {contentParts: [{text: "First", type: "text"}]}, "5": {contentParts: [{text: "Second", type: "text"}]}};

describe("building turns from Pi entries", () => {
  it("starts a turn at each user entry with a record and attaches tool results to their calls", () => {
    const entries = [
      user(1, "First"),
      assistant(
        2,
        [
          {thinking: "Plan", type: "thinking"},
          {arguments: {command: "ls"}, id: "call-1", name: "bash", type: "toolCall"},
        ],
        {stopReason: "toolUse"}
      ),
      toolResult(3, "call-1", "a.ts"),
      assistant(4, [{text: "Done.", type: "text"}]),
      user(5, "Second"),
      assistant(6, [{text: "Again.", type: "text"}]),
    ];

    const result = buildTurns({entries, turns});

    expect(result.map((turn) => turn.id)).toEqual(["1", "5"]);
    expect(result[0]).toMatchObject({
      events: [
        {content: "Plan", type: "reasoning"},
        {durationMs: 1000, tool: {arguments: {command: "ls"}, name: "bash", result: {content: [{text: "a.ts"}]}, status: "completed"}, type: "tool"},
        {content: "Done.", type: "assistant"},
      ],
      status: "completed",
      userMessage: {contentParts: [{text: "First", type: "text"}]},
    });
  });

  it("folds a user entry without a turn record into the current turn and shows compaction summaries where they happened", () => {
    const entries = [
      user(1, "First"),
      assistant(2, [{text: "One", type: "text"}]),
      user(3, "extension continuation"),
      compaction(4, "Summary"),
      assistant(6, [{text: "Two", type: "text"}]),
    ];

    const [turn] = buildTurns({entries, turns});

    expect(turn?.events).toMatchObject([
      {content: "One", type: "assistant"},
      {status: "completed", summary: "Summary", type: "compaction"},
      {content: "Two", type: "assistant"},
    ]);
  });

  it("marks a turn with an assistant error as failed, but not an aborted one", () => {
    const failed = buildTurns({entries: [user(1, "First"), assistant(2, [], {errorMessage: "Overloaded", stopReason: "error"})], turns});
    const aborted = buildTurns({entries: [user(1, "First"), assistant(2, [], {errorMessage: "Aborted", stopReason: "aborted"})], turns});

    expect(failed[0]).toMatchObject({events: [{error: "Overloaded", type: "assistant"}], status: "error"});
    expect(aborted[0]).toMatchObject({events: [], status: "completed"});
  });

  it("restores image payloads from Pi's user message onto authored attachments", () => {
    const parts: Session["turns"] = {
      "1": {contentParts: [{id: "image-1", kind: "image", mime: "image/png", name: "a.png", size: 1, type: "attachment"}]},
    };
    const [turn] = buildTurns({
      entries: [
        user(1, "", [
          {text: "", type: "text"},
          {data: "BASE64", mimeType: "image/png", type: "image"},
        ]),
      ],
      turns: parts,
    });

    expect(turn?.userMessage.contentParts).toEqual([{contentBase64: "BASE64", id: "image-1", kind: "image", mime: "image/png", name: "a.png", size: 1, type: "attachment"}]);
  });
});

describe("splitting a running session into committed and live turns", () => {
  it("projects entries from the run's first user entry, plus pi.live, as the live turn", () => {
    const live = {
      compactions: [{attempt: 1, blocking: true, reason: "threshold", taskId: 9}],
      generation: {
        attempt: 0,
        message: {
          ...assistant(0, [
            {text: "Stream", type: "text"},
            {arguments: {command: "l"}, id: "call-2", name: "bash", type: "toolCall"},
          ]).model![0],
        },
      },
      run: {inputs: [1], taskId: 1},
    } as unknown as LiveState;
    const entries = [user(1, "First"), assistant(2, [{text: "Old", type: "text"}]), user(5, "Second")];

    const {liveTurn, turns: committed} = buildSessionTurns({entries, live, runStart: 5, turns});

    expect(committed.map((turn) => turn.id)).toEqual(["1"]);
    expect(liveTurn).toMatchObject({
      events: [
        {status: "pending", type: "compaction"},
        {content: "Stream", type: "assistant"},
        // The streaming partial's last call may be cut, so its arguments stay hidden.
        {tool: {arguments: undefined, name: "bash", status: "pending"}, type: "tool"},
      ],
      id: "5",
      status: "streaming",
    });
  });

  it("has no live turn while idle", () => {
    const {liveTurn, turns: committed} = buildSessionTurns({entries: [user(1, "First")], live: {}, turns});

    expect(liveTurn).toBeUndefined();
    expect(committed).toHaveLength(1);
  });
});
