import {describe, expect, it} from "vitest";
import {fetchWebContent, MAX_RESPONSE_BYTES, MAX_TIMEOUT_SECONDS} from "@supernova/agent-runtime/layers/session-runtime/lib/tools/web-fetch/web-fetch-content";

function response(body: BodyInit, init?: ResponseInit): Response {
  return new Response(body, init);
}

describe("fetchWebContent", () => {
  it("defaults to markdown and converts HTML responses", async () => {
    const result = await fetchWebContent({
      fetch: async () => response("<h1>Hello</h1><p>world</p><script>bad()</script>", {headers: {"content-type": "text/html; charset=utf-8"}}),
      url: "https://example.com/page",
    });

    expect(result).toEqual({
      contentType: "text/html; charset=utf-8",
      format: "markdown",
      output: "# Hello\n\nworld",
      url: "https://example.com/page",
    });
  });

  it("extracts text from HTML when text format is requested", async () => {
    const result = await fetchWebContent({
      fetch: async () => response("<body>Hello <b>world</b><style>.x {}</style></body>", {headers: {"content-type": "text/html"}}),
      format: "text",
      url: "https://example.com/page",
    });

    expect(result.output).toBe("Hello world");
  });

  it("preserves ordinary text responses", async () => {
    const result = await fetchWebContent({
      fetch: async () => response("hello", {headers: {"content-type": "text/plain"}}),
      format: "text",
      url: "http://example.com/file.txt",
    });

    expect(result).toMatchObject({contentType: "text/plain", format: "text", output: "hello", url: "http://example.com/file.txt"});
  });

  it("rejects invalid inputs before fetching", async () => {
    const cases = [
      {input: {url: "file:///etc/passwd"}, message: "URL must use http:// or https://"},
      {input: {timeoutSeconds: 0, url: "https://example.com"}, message: `Timeout must be greater than 0 and no more than ${MAX_TIMEOUT_SECONDS} seconds`},
      {input: {timeoutSeconds: MAX_TIMEOUT_SECONDS + 1, url: "https://example.com"}, message: `Timeout must be greater than 0 and no more than ${MAX_TIMEOUT_SECONDS} seconds`},
    ] as const;

    for (const testCase of cases) {
      await expect(fetchWebContent({...testCase.input, fetch: async () => response("unused")})).rejects.toThrow(testCase.message);
    }
  });

  it("rejects declared and streamed oversized bodies", async () => {
    await expect(
      fetchWebContent({
        fetch: async () => response("small", {headers: {"content-length": String(MAX_RESPONSE_BYTES + 1), "content-type": "text/plain"}}),
        url: "https://example.com/declared",
      })
    ).rejects.toThrow(`Response too large (exceeds ${MAX_RESPONSE_BYTES} byte limit)`);

    await expect(
      fetchWebContent({
        fetch: async () => response("x".repeat(MAX_RESPONSE_BYTES + 1), {headers: {"content-type": "text/plain"}}),
        url: "https://example.com/streamed",
      })
    ).rejects.toThrow(`Response too large (exceeds ${MAX_RESPONSE_BYTES} byte limit)`);
  });

  it("rejects unsupported content types", async () => {
    await expect(
      fetchWebContent({
        fetch: async () => response("pdf", {headers: {"content-type": "application/pdf"}}),
        url: "https://example.com/file.pdf",
      })
    ).rejects.toThrow("Unsupported fetched content type: application/pdf");
  });

  it("retries Cloudflare challenge responses with the Supernova user agent", async () => {
    const userAgents: string[] = [];
    const result = await fetchWebContent({
      fetch: async (_url, init) => {
        const headers = new Headers(init?.headers);
        userAgents.push(headers.get("user-agent") ?? "");
        if (userAgents.length === 1) {
          return response("challenge", {headers: {"cf-mitigated": "challenge"}, status: 403});
        }
        return response("ok", {headers: {"content-type": "text/plain"}});
      },
      format: "text",
      url: "https://example.com/protected",
    });

    expect(result.output).toBe("ok");
    expect(userAgents[0]).toContain("Mozilla/5.0");
    expect(userAgents[1]).toBe("supernova");
  });

  it("aborts stalled requests", async () => {
    const controller = new AbortController();
    const promise = fetchWebContent({
      fetch: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
      signal: controller.signal,
      url: "https://example.com/slow",
    });

    controller.abort(new Error("stopped"));

    await expect(promise).rejects.toThrow("stopped");
  });
});
