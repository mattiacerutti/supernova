import {beforeEach, describe, expect, test, vi} from "vitest";
import {fileToSessionAttachment, formatAttachmentSize, formatAttachmentType} from "@/features/sessions/lib/attachments/session-attachments";

function testFile(input: {content: BlobPart[]; name: string; type?: string}): File {
  const {content, name, type = ""} = input;
  return new File(content, name, {lastModified: 1, type});
}

describe("session attachments", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {btoa: globalThis.btoa});
  });

  test("creates a text attachment payload with normalized MIME and original bytes", async () => {
    const attachment = await fileToSessionAttachment(testFile({content: ["hello"], name: "notes.md", type: "text/markdown"}));

    expect(attachment).toMatchObject({contentBase64: "aGVsbG8=", mime: "text/plain", name: "notes.md", size: 5});
    expect(attachment.id).toMatch(/^att_[0-9a-f-]+$/);
  });

  test("creates an image attachment payload with image MIME and original bytes", async () => {
    const attachment = await fileToSessionAttachment(testFile({content: [new Uint8Array([1, 2, 3])], name: "image.png", type: "image/png"}));

    expect(attachment).toMatchObject({contentBase64: "AQID", mime: "image/png", name: "image.png", size: 3});
    expect(attachment.id).toMatch(/^att_[0-9a-f-]+$/);
  });

  test("rejects unsupported binary files", async () => {
    const file = testFile({content: [new Uint8Array([0, 1, 2, 3])], name: "archive.bin"});

    await expect(fileToSessionAttachment(file)).rejects.toThrow("archive.bin is not a supported attachment type.");
  });

  test("formats attachment type labels from extension first, then MIME", () => {
    expect(formatAttachmentType({mime: "text/plain", name: "notes.md"})).toBe("MD");
    expect(formatAttachmentType({mime: "application/json", name: "Dockerfile"})).toBe("JSON");
    expect(formatAttachmentType({mime: "application/octet-stream", name: "README"})).toBe("FILE");
  });

  test("formats attachment sizes for UI", () => {
    expect(formatAttachmentSize(512)).toBe("512 B");
    expect(formatAttachmentSize(1536)).toBe("2 KB");
    expect(formatAttachmentSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
