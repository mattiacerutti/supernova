import {describe, expect, it} from "vitest";
import {prepareAttachments} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/message-context/attachments";

describe("prepareSessionAttachments", () => {
  it("classifies supported attachments, preserves original order in metadata, and sends image bytes as Pi image blocks", () => {
    const attachments = prepareAttachments([
      {contentBase64: "aW1hZ2U=", id: "image-1", mime: "image/png", name: "diagram.png", size: 12},
      {contentBase64: "YmluYXJ5", id: "binary-1", mime: "application/octet-stream", name: "archive.bin", size: 6},
      {contentBase64: "bm90ZXM=", id: "text-1", mime: "text/plain", name: "notes.txt", size: 20},
      {id: "image-empty", mime: "image/jpeg", name: "empty.jpg", size: 0},
    ]);

    expect(attachments.images).toEqual([{data: "aW1hZ2U=", mimeType: "image/png", type: "image"}]);
    expect(attachments.metadata).toEqual([
      {id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", order: 0, size: 12},
      {id: "text-1", kind: "text", mime: "text/plain", name: "notes.txt", order: 2, size: 20},
      {id: "image-empty", kind: "image", mime: "image/jpeg", name: "empty.jpg", order: 3, size: 0},
    ]);
    expect(attachments.textContent).toContain('<attachment id="text-1" name="notes.txt" mime="text/plain" size="20">\nnotes\n  </attachment>');
    expect(attachments.textContent).not.toContain("empty.jpg");
    expect(attachments.textContent).not.toContain("archive.bin");
  });

  it("escapes text attachment XML attributes and content", () => {
    const attachments = prepareAttachments([
      {contentBase64: Buffer.from("Use <tag> & 'quote'").toString("base64"), id: "text-1", mime: "text/plain", name: "a&b<'\".txt", size: 10},
    ]);

    expect(attachments.textContent).toBe(
      '<attachments>\n  <attachment id="text-1" name="a&amp;b&lt;&apos;&quot;.txt" mime="text/plain" size="10">\nUse &lt;tag&gt; &amp; &apos;quote&apos;\n  </attachment>\n</attachments>'
    );
  });
});
