import {describe, expect, it} from "vitest";
import {prepareSendMessageContext} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/message-context/send-message-context";
import {imageAttachment, ignoredAttachment, textAttachment} from "@tests/implementations/pi/sessions/pi-session-test-utils";

describe("preparing Pi send-message context", () => {
  it("creates custom metadata entries for supported attachments and matching content parts", () => {
    const contentParts = [
      {text: "Read ", type: "text" as const},
      {id: "part-1", kind: "file" as const, title: "file.ts", type: "reference" as const, value: "@src/file.ts"},
    ];

    const context = prepareSendMessageContext({
      attachments: [imageAttachment, ignoredAttachment],
      contentParts,
      message: "Read @src/file.ts",
      model: {id: "claude-sonnet", providerId: "anthropic"},
      sessionId: "session-1",
    });

    expect(context.customEntries).toEqual([
      {customType: "pi-desktop.attachments", data: {attachments: [{id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", order: 0, size: 12}]}},
      {customType: "pi-desktop.user-message-content-parts", data: {contentParts}},
    ]);
  });

  it("creates a hidden next-turn custom message for text attachment content", () => {
    const context = prepareSendMessageContext({
      attachments: [textAttachment],
      message: "Use the notes",
      model: {id: "claude-sonnet", providerId: "anthropic"},
      sessionId: "session-1",
    });

    expect(context.textAttachmentMessage).toMatchObject({
      content: '<attachments>\n  <attachment id="text-1" name="notes.txt" mime="text/plain" size="20">\nThis is a text file.\n  </attachment>\n</attachments>',
      customType: "pi-desktop.text-attachments",
      details: {attachmentIds: ["text-1"]},
      display: false,
    });
  });

  it("ignores content parts that do not reconstruct the sent message", () => {
    const context = prepareSendMessageContext({
      attachments: [],
      contentParts: [{id: "part-1", kind: "file", title: "file.ts", type: "reference", value: "@src/file.ts"}],
      message: "Read something else",
      model: {id: "claude-sonnet", providerId: "anthropic"},
      sessionId: "session-1",
    });

    expect(context.contentParts).toEqual([]);
    expect(context.customEntries).toEqual([]);
  });
});
