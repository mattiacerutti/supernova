import {convertHtmlToMarkdown, extractTextFromHtml} from "@supernova/agent-runtime/layers/session-runtime/lib/tools/web-fetch/html-content";

export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_TIMEOUT_SECONDS = 30;
export const MAX_TIMEOUT_SECONDS = 120;

export type WebFetchFormat = "html" | "markdown" | "text";

export interface FetchWebContentInput {
  readonly fetch?: typeof fetch;
  readonly format?: WebFetchFormat;
  readonly signal?: AbortSignal | undefined;
  readonly timeoutSeconds?: number | undefined;
  readonly url: string;
}

export interface FetchWebContentResult {
  readonly contentType: string;
  readonly format: WebFetchFormat;
  readonly output: string;
  readonly url: string;
}

const browserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

function resolveFormat(format: WebFetchFormat | undefined): WebFetchFormat {
  return format ?? "markdown";
}

function validateTimeout(timeoutSeconds: number | undefined): number {
  if (timeoutSeconds === undefined) return DEFAULT_TIMEOUT_SECONDS;
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > MAX_TIMEOUT_SECONDS) {
    throw new Error(`Timeout must be greater than 0 and no more than ${MAX_TIMEOUT_SECONDS} seconds`);
  }
  return timeoutSeconds;
}

function parseHttpUrl(url: string): URL {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("URL must use http:// or https://");
  }
  return parsedUrl;
}

function acceptHeader(format: WebFetchFormat): string {
  switch (format) {
    case "html":
      return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1";
    case "markdown":
      return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1";
    case "text":
      return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1";
  }
}

function mimeFrom(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isTextualMime(mime: string): boolean {
  return (
    !mime ||
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime.endsWith("+json") ||
    mime === "application/xml" ||
    mime.endsWith("+xml") ||
    mime === "application/javascript" ||
    mime === "application/x-javascript"
  );
}

function convertContent(content: string, contentType: string, format: WebFetchFormat): string {
  if (!contentType.toLowerCase().includes("text/html")) return content;
  if (format === "markdown") return convertHtmlToMarkdown(content);
  if (format === "text") return extractTextFromHtml(content);
  return content;
}

function makeAbortSignal(input: {readonly parent?: AbortSignal | undefined; readonly timeoutSeconds: number}): {readonly cleanup: () => void; readonly signal: AbortSignal} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Request timed out")), input.timeoutSeconds * 1000);
  const abort = () => controller.abort(input.parent?.reason);

  input.parent?.addEventListener("abort", abort, {once: true});

  return {
    cleanup: () => {
      clearTimeout(timeout);
      input.parent?.removeEventListener("abort", abort);
    },
    signal: controller.signal,
  };
}

async function readResponseBody(response: Response): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    throw new Error(`Response too large (exceeds ${MAX_RESPONSE_BYTES} byte limit)`);
  }

  if (!response.body) {
    return new Uint8Array(await response.arrayBuffer());
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`Response too large (exceeds ${MAX_RESPONSE_BYTES} byte limit)`);
    }
    chunks.push(chunk.value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function fetchResponse(input: {readonly fetch: typeof fetch; readonly format: WebFetchFormat; readonly signal: AbortSignal; readonly url: string}): Promise<Response> {
  const response = await input.fetch(input.url, {
    headers: {
      Accept: acceptHeader(input.format),
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": browserUserAgent,
    },
    signal: input.signal,
  });

  if (response.status === 403 && response.headers.get("cf-mitigated") === "challenge") {
    return input.fetch(input.url, {
      headers: {
        Accept: acceptHeader(input.format),
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "supernova",
      },
      signal: input.signal,
    });
  }

  return response;
}

/** Fetches textual web content and converts HTML responses to the requested format. */
export async function fetchWebContent(input: FetchWebContentInput): Promise<FetchWebContentResult> {
  const parsedUrl = parseHttpUrl(input.url);
  const format = resolveFormat(input.format);
  const timeoutSeconds = validateTimeout(input.timeoutSeconds);
  const abort = makeAbortSignal({parent: input.signal, timeoutSeconds});

  try {
    const response = await fetchResponse({fetch: input.fetch ?? fetch, format, signal: abort.signal, url: parsedUrl.toString()});
    if (!response.ok) {
      throw new Error(`Request failed with HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const mime = mimeFrom(contentType);
    if (!isTextualMime(mime)) {
      throw new Error(`Unsupported fetched content type: ${mime}`);
    }

    const body = await readResponseBody(response);
    const output = convertContent(new TextDecoder().decode(body), contentType, format);

    return {
      contentType,
      format,
      output,
      url: parsedUrl.toString(),
    };
  } finally {
    abort.cleanup();
  }
}
