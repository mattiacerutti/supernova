import {describe, expect, it} from "vitest";
import {convertHtmlToMarkdown, extractTextFromHtml} from "@supernova/agent-runtime/features/session-runtime/tools/lib/html-content";

describe("HTML web fetch content helpers", () => {
  it("extracts text and markdown without active content", () => {
    const html = "<h1>Hello</h1><script>bad()</script><p>world <strong>wide</strong></p><style>.bad {}</style>";

    expect(extractTextFromHtml(html)).toBe("Helloworld wide");
    expect(convertHtmlToMarkdown(html)).toBe("# Hello\n\nworld **wide**");
  });
});
