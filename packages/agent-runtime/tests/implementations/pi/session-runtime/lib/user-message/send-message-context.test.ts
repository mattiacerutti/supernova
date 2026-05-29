import {describe, expect, it} from "vitest";
import type {PiResourceCatalogShape} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-resource-catalog";
import {prepareSendMessageContext} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/user-message/send-message-context";
import {imageAttachment, textAttachment} from "@tests/implementations/pi/pi-session-test-utils";

const resourceCatalog: PiResourceCatalogShape = {
  listPromptTemplates: async () => [],
  listSkills: async () => [],
  readSkillContent: async () => "",
};

describe("preparing Pi send-message context", () => {
  it("separates model inputs from persisted display metadata", async () => {
    const context = await prepareSendMessageContext(
      {
        contentParts: [{text: "Review ", type: "text"}, {id: "file", kind: "file", name: "file.ts", type: "reference", value: "@src/file.ts"}, imageAttachment, textAttachment],
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      },
      {projectPath: process.cwd(), resourceCatalog}
    );

    expect(context.prompt).toContain("Review @src/file.ts");
    expect(context.images).toEqual([{data: "aW1hZ2UtYnl0ZXM=", mimeType: "image/png", type: "image"}]);
    expect(context.customEntries).toEqual([
      {
        customType: "supernova.user-message-content-parts",
        data: {
          contentParts: [
            {text: "Review ", type: "text"},
            {id: "file", kind: "file", name: "file.ts", type: "reference", value: "@src/file.ts"},
            {id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", size: 12, type: "attachment"},
            {id: "text-1", kind: "text", mime: "text/plain", name: "notes.txt", size: 20, type: "attachment"},
          ],
        },
      },
    ]);
  });

  it("does not persist empty content-part metadata", async () => {
    const context = await prepareSendMessageContext(
      {contentParts: [], model: {id: "claude-sonnet", providerId: "anthropic"}, sessionId: "session-1"},
      {projectPath: process.cwd(), resourceCatalog}
    );

    expect(context).toMatchObject({contentParts: [], customEntries: [], images: [], prompt: ""});
  });
});
