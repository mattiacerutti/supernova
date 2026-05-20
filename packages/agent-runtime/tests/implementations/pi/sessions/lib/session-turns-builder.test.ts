import {describe, expect, it} from "vitest";
import {buildPiSessionTurns} from "@supernova/agent-runtime/implementations/pi/sessions/lib/session-turns-builder";
import type {ModelReference} from "@supernova/contracts/sessions/schemas";
import type {AgentSession, SessionEntry} from "@earendil-works/pi-coding-agent";

const model: ModelReference = {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"};

function piEntries(messages: unknown[]): SessionEntry[] {
  let parentId: string | null = null;

  return messages.map((message, index) => {
    const timestamp =
      typeof message === "object" && message !== null && "timestamp" in message ? new Date(message.timestamp as string | number).toISOString() : new Date(0).toISOString();
    const entry: SessionEntry = {
      id: `entry-${index}`,
      message: message as AgentSession["messages"][number],
      parentId,
      timestamp,
      type: "message",
    };

    parentId = entry.id;
    return entry;
  });
}

function expectTurnEvents(turn: ReturnType<typeof buildPiSessionTurns>[number] | undefined, events: Array<Record<string, unknown>>): void {
  expect(turn?.events).toMatchObject(events);
}

describe("projecting Pi branch entries into session turns", () => {
  it("groups a user request, reasoning, tool result, and assistant response into one model-attributed turn", () => {
    const turns = buildPiSessionTurns(
      piEntries([
        {content: [{text: "Fix the tests", type: "text"}], id: "user-1", role: "user", timestamp: 1},
        {
          content: [
            {thinking: "I should inspect the failure first.", type: "thinking"},
            {text: "The tests are fixed.", type: "text"},
          ],
          id: "assistant-1",
          role: "assistant",
          timestamp: 2,
        },
        {content: [{text: "typecheck passed", type: "text"}], id: "tool-1", role: "toolResult", timestamp: 3, toolName: "bash"},
      ]),
      model
    );

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      id: "entry-0",
      model,
      status: "completed",
      userMessage: {content: "Fix the tests", id: "entry-0"},
    });
    expectTurnEvents(turns[0], [
      {
        content: "I should inspect the failure first.",
        type: "reasoning",
      },
      {
        content: "The tests are fixed.",
        type: "assistant",
      },
      {
        tool: {kind: "command", result: {output: "typecheck passed"}, status: "completed"},
        type: "tool",
      },
    ]);
  });

  it("updates a pending tool call when it is the first event in the turn", () => {
    const turns = buildPiSessionTurns(
      piEntries([
        {content: [{text: "Run tests", type: "text"}], id: "user-1", role: "user", timestamp: 1},
        {
          content: [{arguments: {command: "bun test"}, id: "call-1", name: "bash", type: "toolCall"}],
          id: "assistant-1",
          role: "assistant",
          timestamp: 2,
        },
        {content: [{text: "passed", type: "text"}], id: "tool-1", role: "toolResult", timestamp: 5, toolCallId: "call-1", toolName: "bash"},
      ]),
      model
    );

    expectTurnEvents(turns[0], [
      {
        durationMs: 3,
        tool: {input: {command: "bun test"}, kind: "command", result: {output: "passed"}, status: "completed"},
        type: "tool",
      },
    ]);
  });

  it("maps edit tool details into the completed tool result", () => {
    const turns = buildPiSessionTurns(
      piEntries([
        {content: [{text: "Edit the button", type: "text"}], id: "user-1", role: "user", timestamp: 1},
        {
          content: [{arguments: {edits: [{newText: "primary", oldText: "ghost"}], path: "button.tsx"}, id: "call-1", name: "edit", type: "toolCall"}],
          id: "assistant-1",
          role: "assistant",
          timestamp: 2,
        },
        {
          content: [{text: "Successfully replaced 1 block(s) in button.tsx.", type: "text"}],
          details: {diff: "-1 ghost\n+1 primary", firstChangedLine: 1},
          id: "tool-1",
          role: "toolResult",
          timestamp: 3,
          toolCallId: "call-1",
          toolName: "edit",
        },
      ]),
      model
    );

    expectTurnEvents(turns[0], [
      {
        tool: {
          input: {path: "button.tsx", replacements: [{newText: "primary", oldText: "ghost"}]},
          kind: "file-edit",
          result: {diff: "-1 ghost\n+1 primary", firstChangedLine: 1},
          status: "completed",
        },
        type: "tool",
      },
    ]);
  });

  it("preserves assistant content order while replacing completed tool calls in place", () => {
    const turns = buildPiSessionTurns(
      piEntries([
        {content: [{text: "Inspect and fix", type: "text"}], id: "user-1", role: "user", timestamp: 1},
        {
          content: [
            {thinking: "I should inspect the project first.", type: "thinking"},
            {text: "I'll check the files.", type: "text"},
            {arguments: {path: "package.json"}, id: "call-1", name: "read", type: "toolCall"},
            {thinking: "Now I know what to run.", type: "thinking"},
            {arguments: {command: "bun test"}, id: "call-2", name: "bash", type: "toolCall"},
            {text: "The tests are green.", type: "text"},
          ],
          id: "assistant-1",
          role: "assistant",
          timestamp: 2,
        },
        {content: [{text: "package contents", type: "text"}], id: "tool-1", role: "toolResult", timestamp: 3, toolCallId: "call-1", toolName: "read"},
        {content: [{text: "passed", type: "text"}], id: "tool-2", role: "toolResult", timestamp: 4, toolCallId: "call-2", toolName: "bash"},
      ]),
      model
    );

    expectTurnEvents(turns[0], [
      {content: "I should inspect the project first.", type: "reasoning"},
      {content: "I'll check the files.", type: "assistant"},
      {tool: {input: {path: "package.json"}, kind: "file-read", result: {content: "package contents"}, status: "completed"}, type: "tool"},
      {content: "Now I know what to run.", type: "reasoning"},
      {tool: {input: {command: "bun test"}, kind: "command", result: {output: "passed"}, status: "completed"}, type: "tool"},
      {content: "The tests are green.", type: "assistant"},
    ]);
  });

  it("keeps projected turn and event ids stable across rebuilds", () => {
    const entries = piEntries([
      {content: [{text: "Inspect and fix", type: "text"}], id: "user-1", role: "user", timestamp: 1},
      {
        content: [
          {thinking: "I should inspect the project first.", type: "thinking"},
          {text: "I'll check the files.", type: "text"},
          {arguments: {path: "package.json"}, id: "call-1", name: "read", type: "toolCall"},
        ],
        id: "assistant-1",
        role: "assistant",
        timestamp: 2,
      },
      {content: [{text: "package contents", type: "text"}], id: "tool-1", role: "toolResult", timestamp: 3, toolCallId: "call-1", toolName: "read"},
    ]);

    const firstBuild = buildPiSessionTurns(entries, model);
    const secondBuild = buildPiSessionTurns(entries, model);

    expect(secondBuild.map((turn) => turn.id)).toEqual(firstBuild.map((turn) => turn.id));
    expect(secondBuild.flatMap((turn) => turn.events.map((event) => event.id))).toEqual(firstBuild.flatMap((turn) => turn.events.map((event) => event.id)));
  });

  it("maps assistant errors into error turns", () => {
    const turns = buildPiSessionTurns(
      piEntries([
        {content: [{text: "Fix it", type: "text"}], id: "user-1", role: "user", timestamp: 1},
        {content: [], errorMessage: "Model failed", id: "assistant-1", role: "assistant", timestamp: 2},
      ]),
      model
    );

    expect(turns[0]).toMatchObject({status: "error"});
    expectTurnEvents(turns[0], [{content: "", error: "Model failed", type: "assistant"}]);
  });

  it("does not render user-initiated aborts as assistant errors", () => {
    const turns = buildPiSessionTurns(
      piEntries([
        {content: [{text: "Fix it", type: "text"}], id: "user-1", role: "user", timestamp: 1},
        {
          content: [{thinking: "I should inspect the project.", type: "thinking"}],
          errorMessage: "Request was aborted.",
          id: "assistant-1",
          role: "assistant",
          stopReason: "aborted",
          timestamp: 2,
        },
      ]),
      model
    );

    expect(turns[0]).toMatchObject({status: "completed"});
    expectTurnEvents(turns[0], [{content: "I should inspect the project.", type: "reasoning"}]);
  });

  it("ignores compaction and custom entries while preserving raw branch messages", () => {
    const turns = buildPiSessionTurns(
      [
        ...piEntries([
          {content: [{text: "First request", type: "text"}], id: "user-1", role: "user", timestamp: 1},
          {content: [{text: "First response", type: "text"}], id: "assistant-1", role: "assistant", timestamp: 2},
        ]),
        {
          firstKeptEntryId: "entry-2",
          id: "compaction-1",
          parentId: "entry-1",
          summary: "Compacted summary",
          timestamp: "1970-01-01T00:00:03.000Z",
          tokensBefore: 1000,
          type: "compaction",
        },
        {customType: "supernova.test", id: "custom-1", parentId: "compaction-1", timestamp: "1970-01-01T00:00:04.000Z", type: "custom"},
        {
          id: "entry-2",
          message: {content: [{text: "Second request", type: "text"}], id: "user-2", role: "user", timestamp: 5} as AgentSession["messages"][number],
          parentId: "custom-1",
          timestamp: "1970-01-01T00:00:05.000Z",
          type: "message",
        },
        {
          id: "entry-3",
          message: {
            api: "anthropic",
            content: [{text: "Second response", type: "text"}],
            id: "assistant-2",
            model: "claude-sonnet",
            provider: "anthropic",
            role: "assistant",
            stopReason: "stop",
            timestamp: 6,
            usage: {cacheRead: 0, cacheWrite: 0, cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0}, input: 0, output: 0, totalTokens: 0},
          } as AgentSession["messages"][number],
          parentId: "entry-2",
          timestamp: "1970-01-01T00:00:06.000Z",
          type: "message",
        },
      ],
      model
    );

    expect(turns).toMatchObject([
      {events: [{content: "First response", type: "assistant"}], userMessage: {content: "First request"}},
      {events: [{content: "Second response", type: "assistant"}], userMessage: {content: "Second request"}},
    ]);
  });

  it("reconstructs attachment metadata and image previews from branch entries", () => {
    const entries: SessionEntry[] = [
      {
        customType: "supernova.attachments",
        data: {
          attachments: [
            {id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", order: 0, size: 12},
            {id: "text-1", kind: "text", mime: "text/plain", name: "notes.txt", order: 1, size: 24},
          ],
        },
        id: "attachments-1",
        parentId: null,
        timestamp: "1970-01-01T00:00:00.001Z",
        type: "custom",
      },
      {
        id: "user-1",
        message: {
          content: [
            {text: "Review these files", type: "text"},
            {data: "aW1hZ2UtYnl0ZXM=", mimeType: "image/png", type: "image"},
          ],
          id: "user-message-1",
          role: "user",
          timestamp: 2,
        } as AgentSession["messages"][number],
        parentId: "attachments-1",
        timestamp: "1970-01-01T00:00:00.002Z",
        type: "message",
      },
      {
        content: "<attachments>text content for the model</attachments>",
        customType: "supernova.text-attachments",
        display: false,
        id: "text-attachments-1",
        parentId: "user-1",
        timestamp: "1970-01-01T00:00:00.003Z",
        type: "custom_message",
      },
      {
        id: "assistant-1",
        message: {
          api: "anthropic",
          content: [{text: "Reviewed.", type: "text"}],
          id: "assistant-message-1",
          model: "claude-sonnet",
          provider: "anthropic",
          role: "assistant",
          stopReason: "stop",
          timestamp: 4,
          usage: {cacheRead: 0, cacheWrite: 0, cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0}, input: 0, output: 0, totalTokens: 0},
        } as AgentSession["messages"][number],
        parentId: "text-attachments-1",
        timestamp: "1970-01-01T00:00:00.004Z",
        type: "message",
      },
    ];

    const turns = buildPiSessionTurns(entries, model);

    expect(turns).toMatchObject([
      {
        events: [{content: "Reviewed.", type: "assistant"}],
        userMessage: {
          attachments: [
            {contentBase64: "aW1hZ2UtYnl0ZXM=", id: "image-1", mime: "image/png", name: "diagram.png", size: 12},
            {id: "text-1", mime: "text/plain", name: "notes.txt", size: 24},
          ],
          content: "Review these files",
        },
      },
    ]);
  });

  it("preserves mixed attachment order while matching multiple image previews by image order", () => {
    const entries: SessionEntry[] = [
      {
        customType: "supernova.attachments",
        data: {
          attachments: [
            {id: "text-1", kind: "text", mime: "text/plain", name: "notes.txt", order: 0, size: 10},
            {id: "image-1", kind: "image", mime: "image/png", name: "first.png", order: 1, size: 11},
            {id: "text-2", kind: "text", mime: "text/markdown", name: "plan.md", order: 2, size: 12},
            {id: "image-2", kind: "image", mime: "image/jpeg", name: "second.jpg", order: 3, size: 13},
          ],
        },
        id: "attachments-1",
        parentId: null,
        timestamp: "1970-01-01T00:00:00.001Z",
        type: "custom",
      },
      {
        id: "user-1",
        message: {
          content: [
            {text: "Review all attachments", type: "text"},
            {data: "Zmlyc3QtaW1hZ2U=", mimeType: "image/png", type: "image"},
            {data: "c2Vjb25kLWltYWdl", mimeType: "image/jpeg", type: "image"},
          ],
          id: "user-message-1",
          role: "user",
          timestamp: 2,
        } as AgentSession["messages"][number],
        parentId: "attachments-1",
        timestamp: "1970-01-01T00:00:00.002Z",
        type: "message",
      },
      {
        id: "assistant-1",
        message: {
          api: "anthropic",
          content: [{text: "Reviewed all attachments.", type: "text"}],
          id: "assistant-message-1",
          model: "claude-sonnet",
          provider: "anthropic",
          role: "assistant",
          stopReason: "stop",
          timestamp: 3,
          usage: {cacheRead: 0, cacheWrite: 0, cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0}, input: 0, output: 0, totalTokens: 0},
        } as AgentSession["messages"][number],
        parentId: "user-1",
        timestamp: "1970-01-01T00:00:00.003Z",
        type: "message",
      },
    ];

    const turns = buildPiSessionTurns(entries, model);

    expect(turns[0]?.userMessage.attachments).toEqual([
      {id: "text-1", mime: "text/plain", name: "notes.txt", size: 10},
      {contentBase64: "Zmlyc3QtaW1hZ2U=", id: "image-1", mime: "image/png", name: "first.png", size: 11},
      {id: "text-2", mime: "text/markdown", name: "plan.md", size: 12},
      {contentBase64: "c2Vjb25kLWltYWdl", id: "image-2", mime: "image/jpeg", name: "second.jpg", size: 13},
    ]);
  });

  it("keeps attachment-only user messages", () => {
    const turns = buildPiSessionTurns(
      [
        {
          customType: "supernova.attachments",
          data: {attachments: [{id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", order: 0, size: 12}]},
          id: "attachments-1",
          parentId: null,
          timestamp: "1970-01-01T00:00:00.001Z",
          type: "custom",
        },
        {
          id: "user-1",
          message: {
            content: [
              {text: "", type: "text"},
              {data: "aW1hZ2UtYnl0ZXM=", mimeType: "image/png", type: "image"},
            ],
            id: "user-message-1",
            role: "user",
            timestamp: 2,
          } as AgentSession["messages"][number],
          parentId: "attachments-1",
          timestamp: "1970-01-01T00:00:00.002Z",
          type: "message",
        },
        {
          id: "assistant-1",
          message: {
            api: "anthropic",
            content: [{text: "Reviewed.", type: "text"}],
            id: "assistant-message-1",
            model: "claude-sonnet",
            provider: "anthropic",
            role: "assistant",
            stopReason: "stop",
            timestamp: 3,
            usage: {cacheRead: 0, cacheWrite: 0, cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0}, input: 0, output: 0, totalTokens: 0},
          } as AgentSession["messages"][number],
          parentId: "user-1",
          timestamp: "1970-01-01T00:00:00.003Z",
          type: "message",
        },
      ],
      model
    );

    expect(turns).toMatchObject([
      {
        events: [{content: "Reviewed.", type: "assistant"}],
        userMessage: {
          attachments: [{contentBase64: "aW1hZ2UtYnl0ZXM=", id: "image-1", mime: "image/png", name: "diagram.png", size: 12}],
          content: "",
        },
      },
    ]);
  });

  it("reconstructs selected reference content parts from branch entries", () => {
    const entries: SessionEntry[] = [
      {
        customType: "supernova.user-message-content-parts",
        data: {
          contentParts: [
            {text: "Read ", type: "text"},
            {id: "part-1", kind: "file", title: "file.ts", type: "reference", value: "@src/file.ts"},
          ],
        },
        id: "content-parts-1",
        parentId: null,
        timestamp: "1970-01-01T00:00:00.001Z",
        type: "custom",
      },
      {
        id: "user-1",
        message: {content: [{text: "Read @src/file.ts", type: "text"}], id: "user-message-1", role: "user", timestamp: 2} as AgentSession["messages"][number],
        parentId: "content-parts-1",
        timestamp: "1970-01-01T00:00:00.002Z",
        type: "message",
      },
      {
        id: "assistant-1",
        message: {content: [{text: "Read it.", type: "text"}], id: "assistant-message-1", role: "assistant", timestamp: 3} as unknown as AgentSession["messages"][number],
        parentId: "user-1",
        timestamp: "1970-01-01T00:00:00.003Z",
        type: "message",
      },
    ];

    expect(buildPiSessionTurns(entries, model)[0]?.userMessage).toMatchObject({
      content: "Read @src/file.ts",
      contentParts: [
        {text: "Read ", type: "text"},
        {id: "part-1", kind: "file", title: "file.ts", type: "reference", value: "@src/file.ts"},
      ],
    });
  });

  it("ignores reference content parts that do not match user message text", () => {
    const entries: SessionEntry[] = [
      {
        customType: "supernova.user-message-content-parts",
        data: {contentParts: [{id: "part-1", kind: "file", title: "file.ts", type: "reference", value: "@src/file.ts"}]},
        id: "content-parts-1",
        parentId: null,
        timestamp: "1970-01-01T00:00:00.001Z",
        type: "custom",
      },
      {
        id: "user-1",
        message: {content: [{text: "Read something else", type: "text"}], id: "user-message-1", role: "user", timestamp: 2} as AgentSession["messages"][number],
        parentId: "content-parts-1",
        timestamp: "1970-01-01T00:00:00.002Z",
        type: "message",
      },
    ];

    expect(buildPiSessionTurns(entries, model)[0]?.userMessage.contentParts).toBeUndefined();
  });

  it("ignores assistant and tool result entries before the first user message", () => {
    const turns = buildPiSessionTurns(
      piEntries([
        {content: [{text: "orphan response", type: "text"}], id: "assistant-1", role: "assistant", timestamp: 1},
        {content: [{text: "orphan tool output", type: "text"}], id: "tool-1", role: "toolResult", timestamp: 2, toolCallId: "call-1", toolName: "bash"},
        {content: [{text: "Real request", type: "text"}], id: "user-1", role: "user", timestamp: 3},
        {content: [{text: "Real response", type: "text"}], id: "assistant-2", role: "assistant", timestamp: 4},
      ]),
      model
    );

    expect(turns).toMatchObject([
      {
        events: [{content: "Real response", type: "assistant"}],
        userMessage: {content: "Real request"},
      },
    ]);
  });
});
