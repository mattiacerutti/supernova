import type {SessionEntry} from "@earendil-works/pi-coding-agent";
import {describe, expect, it} from "vitest";
import {buildPiTurns} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns-builder";
import {
  assistantMessage,
  contentPartsEntry,
  messageEntry,
  piAgentMessage,
  piEntries,
  selectedModelReference,
  userMessage,
} from "@tests/implementations/pi/sessions/pi-session-test-utils";

describe("projecting Pi branch entries into session turns", () => {
  it("groups user, assistant, and completed tool messages into one ordered turn", () => {
    const turns = buildPiTurns(
      piEntries([
        userMessage("Run the tests", 1),
        piAgentMessage({
          content: [
            {thinking: "Inspect first.", type: "thinking"},
            {text: "Running tests.", type: "text"},
            {arguments: {command: "bun test"}, id: "call-1", name: "bash", type: "toolCall"},
            {text: "Green.", type: "text"},
          ],
          id: "assistant-1",
          role: "assistant",
          timestamp: 2,
        }),
        piAgentMessage({content: [{text: "passed", type: "text"}], id: "tool-1", role: "toolResult", timestamp: 5, toolCallId: "call-1", toolName: "bash"}),
      ]),
      selectedModelReference
    );

    expect(turns).toMatchObject([
      {
        model: selectedModelReference,
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
    const entries = piEntries([userMessage("Fix it", 1), assistantMessage("Done", 2)]);

    const first = buildPiTurns(entries, selectedModelReference);
    const second = buildPiTurns(entries, selectedModelReference);

    expect(second.map((turn) => turn.id)).toEqual(first.map((turn) => turn.id));
    expect(second.flatMap((turn) => turn.events.map((event) => event.id))).toEqual(first.flatMap((turn) => turn.events.map((event) => event.id)));
  });

  it("renders assistant failures, but not user-initiated aborts, as error turns", () => {
    const failed = buildPiTurns(
      piEntries([userMessage("Fix it", 1), piAgentMessage({content: [], errorMessage: "Model failed", id: "assistant-1", role: "assistant", timestamp: 2})]),
      selectedModelReference
    );
    const aborted = buildPiTurns(
      piEntries([
        userMessage("Stop", 1),
        piAgentMessage({
          content: [{thinking: "Stopping.", type: "thinking"}],
          errorMessage: "Request was aborted.",
          id: "assistant-1",
          role: "assistant",
          stopReason: "aborted",
          timestamp: 2,
        }),
      ]),
      selectedModelReference
    );

    expect(failed).toMatchObject([{events: [{error: "Model failed", type: "assistant"}], status: "error"}]);
    expect(aborted).toMatchObject([{events: [{content: "Stopping.", type: "reasoning"}], status: "completed"}]);
  });

  it("adds compaction summaries to the turn that triggered them while preserving raw branch messages", () => {
    const entries: SessionEntry[] = [
      contentPartsEntry([{text: "First request", type: "text"}], {id: "first-content"}),
      messageEntry(userMessage("First request", 1), {id: "first-user", parentId: "first-content"}),
      messageEntry(assistantMessage("First response", 2), {id: "first-assistant", parentId: "first-user"}),
      {
        firstKeptEntryId: "second-user",
        id: "compaction-1",
        parentId: "first-assistant",
        summary: "Compacted summary",
        timestamp: "1970-01-01T00:00:00.003Z",
        tokensBefore: 1000,
        type: "compaction",
      },
      {customType: "supernova.other", id: "custom-1", parentId: "compaction-1", timestamp: "1970-01-01T00:00:00.004Z", type: "custom"},
      contentPartsEntry([{text: "Second request", type: "text"}], {id: "second-content", parentId: "custom-1"}),
      messageEntry(userMessage("Second request", 5), {id: "second-user", parentId: "second-content"}),
      messageEntry(assistantMessage("Second response", 6), {id: "second-assistant", parentId: "second-user"}),
    ];

    expect(buildPiTurns(entries, selectedModelReference)).toMatchObject([
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
    const turns = buildPiTurns(
      [
        contentPartsEntry([{text: "First request", type: "text"}], {id: "content"}),
        {
          firstKeptEntryId: "kept-user",
          id: "compaction-before-user",
          parentId: "content",
          summary: "Live summary",
          timestamp: "1970-01-01T00:00:00.002Z",
          tokensBefore: 1000,
          type: "compaction",
        },
        messageEntry(userMessage("First request", 1), {id: "user", parentId: "compaction-before-user"}),
        messageEntry(assistantMessage("First response", 2), {id: "assistant", parentId: "user"}),
      ],
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

  it("keeps compaction events in order between other turn events", () => {
    const turns = buildPiTurns(
      [
        contentPartsEntry([{text: "First request", type: "text"}], {id: "content"}),
        messageEntry(userMessage("First request", 1), {id: "user", parentId: "content"}),
        messageEntry(assistantMessage("Before compaction", 2), {id: "assistant-before", parentId: "user"}),
        {
          firstKeptEntryId: "user",
          id: "compaction-between-events",
          parentId: "assistant-before",
          summary: "Compacted summary",
          timestamp: "1970-01-01T00:00:00.003Z",
          tokensBefore: 1000,
          type: "compaction",
        },
        messageEntry(assistantMessage("After compaction", 4), {id: "assistant-after", parentId: "compaction-between-events"}),
      ],
      selectedModelReference
    );

    expect(turns).toMatchObject([
      {
        events: [
          {content: "Before compaction", type: "assistant"},
          {id: "compaction-between-events", status: "completed", summary: "Compacted summary", type: "compaction"},
          {content: "After compaction", type: "assistant"},
        ],
        status: "completed",
      },
    ]);
  });

  it("maps empty synthetic compaction entries as pending events", () => {
    const turns = buildPiTurns(
      [
        contentPartsEntry([{text: "First request", type: "text"}], {id: "content"}),
        {firstKeptEntryId: "", id: "pending-compaction", parentId: "content", summary: "", timestamp: "1970-01-01T00:00:00.002Z", tokensBefore: 0, type: "compaction"},
        messageEntry(userMessage("First request", 1), {id: "user", parentId: "pending-compaction"}),
      ],
      selectedModelReference
    );

    expect(turns).toMatchObject([{events: [{id: "pending-compaction", status: "pending", type: "compaction"}]}]);
  });

  it("uses stored content parts as the display source and restores image previews by image order", () => {
    const contentParts = [
      {text: "Review ", type: "text" as const},
      {id: "file", kind: "file" as const, name: "file.ts", type: "reference" as const, value: "@src/file.ts"},
      {id: "first-image", kind: "image" as const, mime: "image/png", name: "first.png", size: 11, type: "attachment" as const},
      {id: "notes", kind: "text" as const, mime: "text/plain", name: "notes.txt", size: 12, type: "attachment" as const},
      {id: "second-image", kind: "image" as const, mime: "image/jpeg", name: "second.jpg", size: 13, type: "attachment" as const},
    ];
    const entries = [
      contentPartsEntry(contentParts),
      messageEntry(
        piAgentMessage({
          content: [
            {text: "Review @src/file.ts\n\n<skill>expanded context</skill>", type: "text"},
            {data: "Zmlyc3Q=", mimeType: "image/png", type: "image"},
            {data: "c2Vjb25k", mimeType: "image/jpeg", type: "image"},
          ],
          id: "user-message-1",
          role: "user",
          timestamp: 2,
        }),
        {id: "user-1", parentId: "content-parts-1"}
      ),
      messageEntry(assistantMessage("Reviewed.", 3), {id: "assistant-1", parentId: "user-1"}),
    ];

    expect(buildPiTurns(entries, selectedModelReference)[0]?.userMessage.contentParts).toEqual([
      {text: "Review ", type: "text"},
      {id: "file", kind: "file", name: "file.ts", type: "reference", value: "@src/file.ts"},
      {contentBase64: "Zmlyc3Q=", id: "first-image", kind: "image", mime: "image/png", name: "first.png", size: 11, type: "attachment"},
      {id: "notes", kind: "text", mime: "text/plain", name: "notes.txt", size: 12, type: "attachment"},
      {contentBase64: "c2Vjb25k", id: "second-image", kind: "image", mime: "image/jpeg", name: "second.jpg", size: 13, type: "attachment"},
    ]);
  });

  it("keeps attachment-only user turns", () => {
    const entries = [
      contentPartsEntry([{id: "image", kind: "image", mime: "image/png", name: "diagram.png", size: 12, type: "attachment"}]),
      messageEntry(piAgentMessage({content: [{data: "aW1hZ2U=", mimeType: "image/png", type: "image"}], id: "user-message-1", role: "user", timestamp: 1}), {
        id: "user-1",
        parentId: "content-parts-1",
      }),
      messageEntry(assistantMessage("Reviewed.", 2), {id: "assistant-1", parentId: "user-1"}),
    ];

    expect(buildPiTurns(entries, selectedModelReference)).toMatchObject([
      {events: [{content: "Reviewed.", type: "assistant"}], userMessage: {contentParts: [{contentBase64: "aW1hZ2U=", id: "image", kind: "image"}]}},
    ]);
  });

  it("ignores assistant and tool result entries before the first user message", () => {
    const turns = buildPiTurns(
      piEntries([
        assistantMessage("orphan response", 1),
        piAgentMessage({content: [{text: "orphan output", type: "text"}], id: "tool-1", role: "toolResult", timestamp: 2, toolCallId: "call-1", toolName: "bash"}),
        userMessage("Real request", 3),
        assistantMessage("Real response", 4),
      ]),
      selectedModelReference
    );

    expect(turns).toMatchObject([{events: [{content: "Real response", type: "assistant"}], userMessage: {contentParts: [{text: "Real request", type: "text"}]}}]);
  });
});
