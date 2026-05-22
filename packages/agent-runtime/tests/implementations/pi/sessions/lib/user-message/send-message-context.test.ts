import {describe, expect, it} from "vitest";
import {prepareSendMessageContext} from "@supernova/agent-runtime/implementations/pi/sessions/lib/user-message/send-message-context";
import {imageAttachment, textAttachment} from "@tests/implementations/pi/sessions/pi-session-test-utils";

describe("preparing Pi send-message context", () => {
  it("creates a single sanitized custom metadata entry for content parts", async () => {
    const contentParts = [
      {text: "Read ", type: "text" as const},
      {id: "part-1", kind: "file" as const, name: "file.ts", type: "reference" as const, value: "@src/file.ts"},
      imageAttachment,
    ];

    const context = await prepareSendMessageContext(
      {
        contentParts,
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      },
      {projectPath: process.cwd()}
    );

    expect(context.customEntries).toEqual([
      {
        customType: "supernova.user-message-content-parts",
        data: {
          contentParts: [
            {text: "Read ", type: "text"},
            {id: "part-1", kind: "file", name: "file.ts", type: "reference", value: "@src/file.ts"},
            {id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", size: 12, type: "attachment"},
          ],
        },
      },
    ]);
    expect(context.images).toEqual([{data: "aW1hZ2UtYnl0ZXM=", mimeType: "image/png", type: "image"}]);
  });

  it("appends text attachment content to the prompt", async () => {
    const context = await prepareSendMessageContext(
      {
        contentParts: [{text: "Use the notes", type: "text"}, textAttachment],
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      },
      {projectPath: process.cwd()}
    );

    expect(context.prompt).toBe('Use the notes\n\n<attachment id="text-1" name="notes.txt" mime="text/plain" size="20">\nThis is a text file.\n</attachment>');
  });

  it("derives display content from content parts", async () => {
    const context = await prepareSendMessageContext(
      {
        contentParts: [{id: "part-1", kind: "file", name: "file.ts", type: "reference", value: "@src/file.ts"}],
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      },
      {projectPath: process.cwd()}
    );

    expect(context.prompt).toBe("@src/file.ts");
  });
});
