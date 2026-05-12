import {describe, expect, test} from "vitest";
import {attachmentMime, fileRequiresImageCapability} from "@/features/sessions/lib/attachments/attachment-classification";

function testFile(input: {content: BlobPart[]; name: string; type?: string}): File {
  const {content, name, type = ""} = input;
  return new File(content, name, {type});
}

async function mimeFor(file: File): Promise<string | undefined> {
  return attachmentMime(file, await file.arrayBuffer());
}

describe("attachment classification", () => {
  test("accepts supported image files as their image MIME", async () => {
    const file = testFile({content: [new Uint8Array([1, 2, 3])], name: "image.png", type: "image/png"});

    await expect(mimeFor(file)).resolves.toBe("image/png");
    expect(fileRequiresImageCapability(file)).toBe(true);
  });

  test("uses image extension fallback when the browser MIME is unknown", async () => {
    const file = testFile({content: [new Uint8Array([1, 2, 3])], name: "image.webp", type: "application/octet-stream"});

    await expect(mimeFor(file)).resolves.toBe("image/webp");
    expect(fileRequiresImageCapability(file)).toBe(true);
  });

  test("does not treat unknown image-like files as images without MIME or fallback", async () => {
    const file = testFile({content: [new Uint8Array([0, 1, 2, 3])], name: "image.heic"});

    await expect(mimeFor(file)).resolves.toBeUndefined();
    expect(fileRequiresImageCapability(file)).toBe(false);
  });

  test("normalizes proper text MIME attachments to plain text", async () => {
    const file = testFile({content: ['{"ok":true}'], name: "data.json", type: "application/json"});

    await expect(mimeFor(file)).resolves.toBe("text/plain");
    expect(fileRequiresImageCapability(file)).toBe(false);
  });

  test("normalizes known text extensions despite unhelpful browser MIME", async () => {
    const file = testFile({content: ["const value = 1;"], name: "module.ts", type: "application/octet-stream"});

    await expect(mimeFor(file)).resolves.toBe("text/plain");
    expect(fileRequiresImageCapability(file)).toBe(false);
  });

  test("accepts unknown text-like files by sniffing bytes", async () => {
    const file = testFile({content: ["hello from an extensionless file"], name: "README"});

    await expect(mimeFor(file)).resolves.toBe("text/plain");
    expect(fileRequiresImageCapability(file)).toBe(false);
  });

  test("rejects unsupported binary files for now", async () => {
    const file = testFile({content: [new Uint8Array([0, 1, 2, 3])], name: "archive.bin"});

    await expect(mimeFor(file)).resolves.toBeUndefined();
    expect(fileRequiresImageCapability(file)).toBe(false);
  });
});
