import {defineExtension, defineTool} from "@earendil-works/pi-durable";
import {Type} from "typebox";
import type {PromptedTool, SessionExtension} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";
import {fetchWebContent} from "@supernova/agent-runtime/features/session-runtime/tools/lib/web-fetch-content";
import type {FetchWebContentResult} from "@supernova/agent-runtime/features/session-runtime/tools/lib/web-fetch-content";

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

/** Fetches textual web content for the session; Supernova's own, offered in every session after the coding tools. */
export const webFetchTool: PromptedTool = {
  ...defineTool<typeof parameters, FetchWebContentResult & Record<string, string>>({
    name: "web_fetch",
    description: "Fetch content from an HTTP or HTTPS URL and return it as text, markdown, or HTML. Markdown is the default.",
    parameters,
    executionMode: "parallel",
    async execute(args, _api, context) {
      const result = await fetchWebContent({format: args.format, signal: context.abortSignal, timeoutSeconds: args.timeout, url: args.url});
      return {content: [{text: result.output, type: "text"}], details: {...result}};
    },
  }),
  prompt: {
    snippet: "web_fetch: fetch textual HTTP/HTTPS URL content as markdown, text, or HTML",
    guidelines: ["Use web_fetch when the user provides a URL or asks you to inspect web content. Prefer more targeted tools when available."],
  },
};

/** Supernova's own tools as one engine extension, installed in every session from memory. */
export const SupernovaTools: SessionExtension = defineExtension({name: "supernova.tools", tools: [webFetchTool]});
