import {describe, expect, it} from "vitest";
import {createLiveBranchEntries} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/turns/live-branch-entries";
import {assistantMessage, userMessage} from "@tests/implementations/pi/sessions/pi-session-test-utils";

describe("creating live Pi branch entries", () => {
  it("creates parent-linked synthetic entries with stable ids", () => {
    const messages = [userMessage("Fix it", 1), assistantMessage("Done", 2)];
    const entries = createLiveBranchEntries({messages, parentId: "base-entry", sessionId: "session-1"});

    expect(entries).toMatchObject([
      {message: messages[0], parentId: "base-entry", type: "message"},
      {message: messages[1], parentId: entries[0]?.id, type: "message"},
    ]);
    expect(createLiveBranchEntries({messages, parentId: "base-entry", sessionId: "session-1"}).map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id));
  });

  it("prepends selected content-part metadata before the live user message", () => {
    const contentParts = [
      {text: "Read ", type: "text" as const},
      {id: "file", kind: "file" as const, name: "file.ts", type: "reference" as const, value: "@src/file.ts"},
    ];
    const user = userMessage("Read @src/file.ts", 1);

    const entries = createLiveBranchEntries({contentParts, messages: [user], parentId: null, sessionId: "session-1"});

    expect(entries).toMatchObject([
      {customType: "supernova.user-message-content-parts", data: {contentParts}, parentId: null, type: "custom"},
      {message: user, parentId: entries[0]?.id, type: "message"},
    ]);
  });

  it("converts live compaction summaries into compaction branch entries", () => {
    const entries = createLiveBranchEntries({
      messages: [{role: "compactionSummary", summary: "Compacted context", timestamp: 3, tokensBefore: 1000}, userMessage("Continue", 4)],
      parentId: "content-parts",
      sessionId: "session-1",
    });

    expect(entries).toMatchObject([
      {firstKeptEntryId: "", parentId: "content-parts", summary: "Compacted context", tokensBefore: 1000, type: "compaction"},
      {message: expect.objectContaining({role: "user"}), parentId: entries[0]?.id, type: "message"},
    ]);
  });

  it("keeps post-assistant live compaction after the assistant message", () => {
    const entries = createLiveBranchEntries({
      contentParts: [{text: "Continue", type: "text"}],
      messages: [userMessage("Continue", 1), assistantMessage("Done.", 2), {role: "compactionSummary", summary: "Compacted context", timestamp: 3, tokensBefore: 1000}],
      parentId: "base-entry",
      sessionId: "session-1",
    });

    expect(entries).toMatchObject([
      {customType: "supernova.user-message-content-parts", parentId: "base-entry", type: "custom"},
      {message: expect.objectContaining({role: "user"}), parentId: entries[0]?.id, type: "message"},
      {message: expect.objectContaining({role: "assistant"}), parentId: entries[1]?.id, type: "message"},
      {firstKeptEntryId: "", parentId: entries[2]?.id, summary: "Compacted context", tokensBefore: 1000, type: "compaction"},
    ]);
  });
});
