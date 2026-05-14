import type {AgentSession} from "@mariozechner/pi-coding-agent";
import {describe, expect, it} from "vitest";
import {createLiveBranchEntries} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/turns/live-branch-entries";

type PiAgentMessage = AgentSession["messages"][number];

const usage = {cacheRead: 0, cacheWrite: 0, cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0}, input: 0, output: 0, totalTokens: 0};

describe("createLiveBranchEntries", () => {
  it("creates a parent-linked branch delta for live Pi messages", () => {
    const messages: PiAgentMessage[] = [
      {content: [{text: "Fix it", type: "text"}], role: "user", timestamp: 1},
      {api: "anthropic", content: [{text: "Done", type: "text"}], model: "claude-sonnet", provider: "anthropic", role: "assistant", stopReason: "stop", timestamp: 2, usage},
    ];

    const entries = createLiveBranchEntries({messages, parentId: "base-entry"});

    expect(entries).toMatchObject([
      {id: "synthetic-0-user", message: messages[0], parentId: "base-entry", timestamp: "1970-01-01T00:00:00.001Z", type: "message"},
      {id: "synthetic-1-assistant", message: messages[1], parentId: "synthetic-0-user", timestamp: "1970-01-01T00:00:00.002Z", type: "message"},
    ]);
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
    });

    expect(entries).toMatchObject([
      {
        customType: "pi-desktop.attachments",
        data: {attachments: [{id: "text-1", kind: "text", mime: "text/plain", name: "notes.txt", order: 0, size: 10}]},
        id: "synthetic-attachments",
        parentId: null,
        timestamp: "1970-01-01T00:00:00.005Z",
        type: "custom",
      },
      {
        content: "hidden context",
        customType: "pi-desktop.text-attachments",
        details: {attachmentIds: ["text-1"]},
        display: false,
        id: "synthetic-0-custom",
        parentId: "synthetic-attachments",
        timestamp: "1970-01-01T00:00:00.005Z",
        type: "custom_message",
      },
    ]);
  });
});
