import type {AssistantMessage, ToolResultMessage, UserMessage as PiUserMessage} from "@earendil-works/pi-ai";
import type {UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {describe, expect, it} from "vitest";
import {buildTurns} from "@supernova/agent-runtime/pi/lib/turns/build-turns";
import type {TimelineEntry} from "@supernova/agent-runtime/pi/lib/turns/build-turns";
import {selectedModelReference} from "@tests/support/session-runtime";

const at = (milliseconds: number) => new Date(milliseconds).toISOString();

function parts(id: string, contentParts: readonly UserMessageContentPart[], timestamp = 0): TimelineEntry {
  return {type: "content-parts", id, timestamp: at(timestamp), contentParts: [...contentParts]};
}

function user(id: string, content: PiUserMessage["content"], timestamp = 1): TimelineEntry {
  return {type: "user", id, timestamp: at(timestamp), message: {role: "user", content, timestamp}};
}

/** An authored text turn start: content parts followed by its user message. */
function request(id: string, text: string, timestamp = 1): TimelineEntry[] {
  return [parts(`${id}-parts`, [{text, type: "text"}], timestamp), user(id, [{text, type: "text"}], timestamp)];
}

function assistant(id: string, content: AssistantMessage["content"] | string, timestamp = 2, extra?: Partial<AssistantMessage>): TimelineEntry {
  const message = {
    api: "faux",
    content: typeof content === "string" ? [{text: content, type: "text"}] : content,
    model: "m",
    provider: "p",
    role: "assistant",
    stopReason: "stop",
    timestamp,
    usage: {cacheRead: 0, cacheWrite: 0, cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0}, input: 0, output: 0, totalTokens: 0},
    ...extra,
  } as AssistantMessage;
  return {type: "assistant", id, timestamp: at(timestamp), message};
}

function toolResult(id: string, toolCallId: string, toolName: string, text: string, timestamp = 5): TimelineEntry {
  const message = {role: "toolResult", toolCallId, toolName, content: [{text, type: "text"}], isError: false, timestamp} as ToolResultMessage;
  return {type: "tool-result", id, timestamp: at(timestamp), message};
}

function compaction(id: string, summary: string | undefined, timestamp = 3): TimelineEntry {
  return {type: "compaction", id, timestamp: at(timestamp), summary};
}

describe("projecting timeline entries into session turns", () => {
  it("groups user, assistant, and completed tool messages into one ordered turn", () => {
    const turns = buildTurns(
      [
        ...request("user-1", "Run the tests"),
        assistant("assistant-1", [
          {thinking: "Inspect first.", type: "thinking"},
          {text: "Running tests.", type: "text"},
          {arguments: {command: "bun test"}, id: "call-1", name: "bash", type: "toolCall"},
          {text: "Green.", type: "text"},
        ]),
        toolResult("tool-1", "call-1", "bash", "passed"),
      ],
      selectedModelReference
    );

    expect(turns).toMatchObject([
      {
        id: "user-1",
        modelReference: selectedModelReference,
        status: "completed",
        userMessage: {contentParts: [{text: "Run the tests", type: "text"}]},
        events: [
          {content: "Inspect first.", type: "reasoning"},
          {content: "Running tests.", type: "assistant"},
          {durationMs: 3, tool: {input: {command: "bun test"}, kind: "command", result: {output: "passed"}, status: "completed"}, type: "tool"},
          {content: "Green.", type: "assistant"},
        ],
      },
    ]);
  });

  it("keeps projected ids stable across rebuilds", () => {
    const entries = [...request("user-1", "Fix it"), assistant("assistant-1", "Done")];

    const first = buildTurns(entries, selectedModelReference);
    const second = buildTurns(entries, selectedModelReference);

    expect(second.map((turn) => turn.id)).toEqual(first.map((turn) => turn.id));
    expect(second.flatMap((turn) => turn.events.map((event) => event.id))).toEqual(first.flatMap((turn) => turn.events.map((event) => event.id)));
  });

  it("renders assistant failures, but not user-initiated aborts, as error turns", () => {
    const failed = buildTurns([...request("user-1", "Fix it"), assistant("assistant-1", [], 2, {errorMessage: "Model failed", stopReason: "error"})], selectedModelReference);
    const aborted = buildTurns(
      [...request("user-1", "Stop"), assistant("assistant-1", [{thinking: "Stopping.", type: "thinking"}], 2, {errorMessage: "Request was aborted.", stopReason: "aborted"})],
      selectedModelReference
    );

    expect(failed).toMatchObject([{events: [{error: "Model failed", type: "assistant"}], status: "error"}]);
    expect(aborted).toMatchObject([{events: [{content: "Stopping.", type: "reasoning"}], status: "completed"}]);
  });

  it("adds compaction summaries to the turn that triggered them", () => {
    const turns = buildTurns(
      [
        ...request("first-user", "First request"),
        assistant("first-assistant", "First response"),
        compaction("compaction-1", "Compacted summary"),
        ...request("second-user", "Second request", 5),
        assistant("second-assistant", "Second response", 6),
      ],
      selectedModelReference
    );

    expect(turns).toMatchObject([
      {
        events: [
          {content: "First response", type: "assistant"},
          {status: "completed", summary: "Compacted summary", type: "compaction"},
        ],
        userMessage: {contentParts: [{text: "First request", type: "text"}]},
      },
      {events: [{content: "Second response", type: "assistant"}], userMessage: {contentParts: [{text: "Second request", type: "text"}]}},
    ]);
  });

  it("adds pre-user compaction events to the following user turn", () => {
    const turns = buildTurns(
      [compaction("compaction-before-user", "Live summary", 0), ...request("user", "First request"), assistant("assistant", "First response")],
      selectedModelReference
    );

    expect(turns).toMatchObject([
      {
        events: [
          {id: "compaction-before-user", status: "completed", summary: "Live summary", type: "compaction"},
          {content: "First response", type: "assistant"},
        ],
      },
    ]);
  });

  it("keeps compaction events in order between other turn events and maps running ones as pending", () => {
    const turns = buildTurns(
      [
        ...request("user", "First request"),
        assistant("assistant-before", "Before compaction"),
        compaction("compaction-between-events", "Compacted summary"),
        assistant("assistant-after", "After compaction", 4),
        compaction("running-compaction", undefined, 5),
      ],
      selectedModelReference
    );

    expect(turns).toMatchObject([
      {
        events: [
          {content: "Before compaction", type: "assistant"},
          {id: "compaction-between-events", status: "completed", summary: "Compacted summary", type: "compaction"},
          {content: "After compaction", type: "assistant"},
          {id: "running-compaction", status: "pending", type: "compaction"},
        ],
        status: "completed",
      },
    ]);
  });

  it("uses stored content parts as the display source and restores image previews by image order", () => {
    const contentParts: UserMessageContentPart[] = [
      {text: "Review ", type: "text"},
      {id: "file", kind: "file", name: "file.ts", type: "reference", value: "@src/file.ts"},
      {id: "first-image", kind: "image", mime: "image/png", name: "first.png", size: 11, type: "attachment"},
      {id: "notes", kind: "text", mime: "text/plain", name: "notes.txt", size: 12, type: "attachment"},
      {id: "second-image", kind: "image", mime: "image/jpeg", name: "second.jpg", size: 13, type: "attachment"},
    ];
    const entries = [
      parts("content-parts-1", contentParts),
      user("user-1", [
        {text: "Review @src/file.ts\n\n<skill>expanded context</skill>", type: "text"},
        {data: "Zmlyc3Q=", mimeType: "image/png", type: "image"},
        {data: "c2Vjb25k", mimeType: "image/jpeg", type: "image"},
      ]),
      assistant("assistant-1", "Reviewed.", 3),
    ];

    expect(buildTurns(entries, selectedModelReference)[0]?.userMessage.contentParts).toEqual([
      {text: "Review ", type: "text"},
      {id: "file", kind: "file", name: "file.ts", type: "reference", value: "@src/file.ts"},
      {contentBase64: "Zmlyc3Q=", id: "first-image", kind: "image", mime: "image/png", name: "first.png", size: 11, type: "attachment"},
      {id: "notes", kind: "text", mime: "text/plain", name: "notes.txt", size: 12, type: "attachment"},
      {contentBase64: "c2Vjb25k", id: "second-image", kind: "image", mime: "image/jpeg", name: "second.jpg", size: 13, type: "attachment"},
    ]);
  });

  it("keeps attachment-only user turns", () => {
    const entries = [
      parts("content-parts-1", [{id: "image", kind: "image", mime: "image/png", name: "diagram.png", size: 12, type: "attachment"}]),
      user("user-1", [{data: "aW1hZ2U=", mimeType: "image/png", type: "image"}]),
      assistant("assistant-1", "Reviewed."),
    ];

    expect(buildTurns(entries, selectedModelReference)).toMatchObject([
      {events: [{content: "Reviewed.", type: "assistant"}], userMessage: {contentParts: [{contentBase64: "aW1hZ2U=", id: "image", kind: "image"}]}},
    ]);
  });

  it("ignores entries before the first authored user message and folds unauthored user messages into the turn", () => {
    const turns = buildTurns(
      [
        assistant("orphan", "orphan response", 1),
        toolResult("tool-1", "call-1", "bash", "orphan output", 2),
        ...request("user", "Real request", 3),
        assistant("assistant", "Real response", 4),
        user("continuation", "Keep going.", 5),
        assistant("assistant-2", "Continued", 6),
      ],
      selectedModelReference
    );

    expect(turns).toMatchObject([
      {
        events: [
          {content: "Real response", type: "assistant"},
          {content: "Continued", type: "assistant"},
        ],
        userMessage: {contentParts: [{text: "Real request", type: "text"}]},
      },
    ]);
  });
});
