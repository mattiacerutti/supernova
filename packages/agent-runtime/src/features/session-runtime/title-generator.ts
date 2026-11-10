import type {AssistantMessage, Context} from "@earendil-works/pi-ai";
import type {UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import type {PiModel, PiSdk} from "@supernova/agent-runtime/pi/sdk";

const sessionTitleSystemPrompt = `Generate a concise title for this coding session based on the user's first message.

Rules:
- Respond with only the title.
- Use 3 to 6 words.
- Do not wrap the title in quotes.
- Do not add punctuation at the end.
- Use the language of the user's message.`;

const sessionTitleMaxTokens = 256;

function titlePrompt(input: {contentParts: readonly UserMessageContentPart[]}): string {
  return input.contentParts
    .map((part) => {
      if (part.type === "text") return part.text;
      return part.name;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function sessionTitleContext(input: {contentParts: readonly UserMessageContentPart[]}): Context {
  return {
    messages: [{content: titlePrompt(input), role: "user", timestamp: Date.now()}],
    systemPrompt: sessionTitleSystemPrompt,
  };
}

function titleFromResponse(response: AssistantMessage): string {
  const title = response.content
    .filter((part): part is {type: "text"; text: string} => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .trim();

  if (title.length === 0) {
    throw new Error("Failed to generate session title.");
  }

  return title;
}

export interface TitleGenerator {
  readonly generateSessionTitle: (input: {readonly contentParts: readonly UserMessageContentPart[]; readonly model: PiModel}) => Promise<string>;
}

export function createTitleGenerator(sdk: Pick<PiSdk, "modelRuntime">): TitleGenerator {
  return {
    generateSessionTitle: async ({contentParts, model}) => {
      const response = await sdk.modelRuntime.completeSimple(model, sessionTitleContext({contentParts}), {maxTokens: sessionTitleMaxTokens});
      return titleFromResponse(response);
    },
  };
}
