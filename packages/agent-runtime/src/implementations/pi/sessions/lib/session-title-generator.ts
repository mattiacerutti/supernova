import type {ModelRegistry} from "@mariozechner/pi-coding-agent";
import {completeSimple} from "@mariozechner/pi-ai";
import {toPiThinkingLevel} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/thinking-levels";

const sessionTitleSystemPrompt = `Generate a concise title for this coding session based on the user's first message.

Rules:
- Respond with only the title.
- Use 3 to 6 words.
- Do not wrap the title in quotes.
- Do not add punctuation at the end.
- Use the language of the user's message.`;

interface IGenerateSessionTitleInput {
  message: string;
  model: Parameters<typeof completeSimple>[0];
  modelRegistry: ModelRegistry;
  thinkingLevel: string | undefined;
}

export async function generateSessionTitle(input: IGenerateSessionTitleInput): Promise<string> {
  const requestAuth = await input.modelRegistry.getApiKeyAndHeaders(input.model);
  if (!requestAuth.ok) throw new Error("Failed to get API key and headers for the model.");
  const thinkingLevel = toPiThinkingLevel(input.thinkingLevel);

  const response = await completeSimple(
    input.model,
    {
      messages: [{content: input.message, role: "user", timestamp: Date.now()}],
      systemPrompt: sessionTitleSystemPrompt,
    },
    {
      apiKey: requestAuth.apiKey,
      headers: requestAuth.headers,
      maxTokens: 32,
      reasoning: thinkingLevel === "off" ? undefined : thinkingLevel,
    }
  );

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
