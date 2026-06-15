import type {AgentToolResult, ToolDefinition} from "@earendil-works/pi-coding-agent";
import {Type} from "typebox";
import {fetchWebContent} from "@supernova/agent-runtime/layers/session-runtime/lib/tools/web-fetch/web-fetch-content";
import type {FetchWebContentResult} from "@supernova/agent-runtime/layers/session-runtime/lib/tools/web-fetch/web-fetch-content";

const parameters = Type.Object({
  format: Type.Optional(
    Type.Union([Type.Literal("markdown"), Type.Literal("text"), Type.Literal("html")], {
      default: "markdown",
      description: "The format to return the content in. Defaults to markdown.",
    })
  ),
  timeout: Type.Optional(
    Type.Number({
      description: "Optional timeout in seconds. Must be greater than 0 and no more than 120.",
      maximum: 120,
      minimum: 1,
    })
  ),
  url: Type.String({description: "The HTTP or HTTPS URL to fetch content from."}),
});

/** Creates the Pi custom tool that fetches textual web content for the active session. */
export function createWebFetchTool(): ToolDefinition<typeof parameters, FetchWebContentResult> {
  return {
    description: "Fetch content from an HTTP or HTTPS URL and return it as text, markdown, or HTML. Markdown is the default.",
    executionMode: "parallel",
    label: "Web Fetch",
    name: "web_fetch",
    parameters,
    promptGuidelines: ["Use web_fetch when the user provides a URL or asks you to inspect web content. Prefer more targeted tools when available."],
    promptSnippet: "web_fetch: fetch textual HTTP/HTTPS URL content as markdown, text, or HTML",
    async execute(_toolCallId, params, signal): Promise<AgentToolResult<FetchWebContentResult>> {
      const result = await fetchWebContent({
        format: params.format,
        signal,
        timeoutSeconds: params.timeout,
        url: params.url,
      });

      return {
        content: [{text: result.output, type: "text"}],
        details: result,
      };
    },
  };
}
