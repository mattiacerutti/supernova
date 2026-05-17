import type {AgentSession} from "@earendil-works/pi-coding-agent";
import {describe, expect, it} from "vitest";
import {createLiveBranchEntries} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/turns/live-branch-entries";

type PiAgentMessage = AgentSession["messages"][number];

const usage = {cacheRead: 0, cacheWrite: 0, cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0}, input: 0, output: 0, totalTokens: 0};

describe("creating live Pi branch entries", () => {
  it("creates a parent-linked branch delta for live Pi messages", () => {
    const messages: PiAgentMessage[] = [
      {content: [{text: "Fix it", type: "text"}], role: "user", timestamp: 1},
      {api: "anthropic", content: [{text: "Done", type: "text"}], model: "claude-sonnet", provider: "anthropic", role: "assistant", stopReason: "stop", timestamp: 2, usage},
    ];

    const entries = createLiveBranchEntries({messages, parentId: "base-entry", sessionId: "session-1"});

    expect(entries).toMatchObject([
      {message: messages[0], parentId: "base-entry", timestamp: "1970-01-01T00:00:00.001Z", type: "message"},
      {message: messages[1], parentId: entries[0]?.id, timestamp: "1970-01-01T00:00:00.002Z", type: "message"},
    ]);
    expect(createLiveBranchEntries({messages, parentId: "base-entry", sessionId: "session-1"}).map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id));
    expect(createLiveBranchEntries({messages, parentId: "other-entry", sessionId: "session-1"}).map((entry) => entry.id)).not.toEqual(entries.map((entry) => entry.id));
  });

  it("prepends attachment metadata and converts custom messages to custom message entries", () => {
    const customMessage = {
      content: "hidden context",
      customType: "pi-desktop.text-attachments",
      details: {attachmentIds: ["text-1"]},
      display: false,
      role: "custom",
      timestamp: 5,
    } satisfies PiAgentMessage;

    const entries = createLiveBranchEntries({
      attachmentMetadata: {attachments: [{id: "text-1", kind: "text", mime: "text/plain", name: "notes.txt", order: 0, size: 10}]},
      messages: [customMessage],
      parentId: null,
      sessionId: "session-1",
    });

    expect(entries).toMatchObject([
      {
        customType: "pi-desktop.attachments",
        data: {attachments: [{id: "text-1", kind: "text", mime: "text/plain", name: "notes.txt", order: 0, size: 10}]},
        parentId: null,
        timestamp: "1970-01-01T00:00:00.005Z",
        type: "custom",
      },
      {
        content: "hidden context",
        customType: "pi-desktop.text-attachments",
        details: {attachmentIds: ["text-1"]},
        display: false,
        parentId: entries[0]?.id,
        timestamp: "1970-01-01T00:00:00.005Z",
        type: "custom_message",
      },
    ]);
  });

  it("prepends selected user message content parts after attachment metadata", () => {
    const userMessage = {content: [{text: "Read @src/file.ts", type: "text"}], role: "user", timestamp: 1} satisfies PiAgentMessage;
    const contentParts = [
      {text: "Read ", type: "text" as const},
      {id: "part-1", kind: "file" as const, title: "file.ts", type: "reference" as const, value: "@src/file.ts"},
    ];

    const entries = createLiveBranchEntries({
      attachmentMetadata: {attachments: [{id: "text-1", kind: "text", mime: "text/plain", name: "notes.txt", order: 0, size: 10}]},
      contentPartsMetadata: {contentParts},
      messages: [userMessage],
      parentId: null,
      sessionId: "session-1",
    });

    expect(entries).toMatchObject([
      {customType: "pi-desktop.attachments", parentId: null, type: "custom"},
      {customType: "pi-desktop.user-message-content-parts", data: {contentParts}, parentId: entries[0]?.id, type: "custom"},
      {message: userMessage, parentId: entries[1]?.id, type: "message"},
    ]);
  });
});
