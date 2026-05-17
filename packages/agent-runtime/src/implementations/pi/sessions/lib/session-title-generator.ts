import type {ModelRegistry} from "@earendil-works/pi-coding-agent";
import {completeSimple} from "@earendil-works/pi-ai";

const sessionTitleSystemPrompt = `Generate a concise title for this coding session based on the user's first message.

Rules:
- Respond with only the title.
- Use 3 to 6 words.
- Do not wrap the title in quotes.
- Do not add punctuation at the end.
- Use the language of the user's message.`;

const sessionTitleMaxTokens = 256;

interface GenerateSessionTitleInput {
  attachmentNames?: readonly string[];
  message: string;
  model: Parameters<typeof completeSimple>[0];
  modelRegistry: ModelRegistry;
}

function titlePrompt(input: {attachmentNames?: readonly string[]; message: string}): string {
  if (!input.attachmentNames?.length) return input.message;

  return `${input.message}\n\nAttached files:\n${input.attachmentNames.map((name) => `- ${name}`).join("\n")}`;
}

export async function generateSessionTitle(input: GenerateSessionTitleInput): Promise<string> {
  const requestAuth = await input.modelRegistry.getApiKeyAndHeaders(input.model);
  if (!requestAuth.ok) throw new Error("Failed to get API key and headers for the model.");

  const response = await completeSimple(
    input.model,
    {
      messages: [{content: titlePrompt(input), role: "user", timestamp: Date.now()}],
      systemPrompt: sessionTitleSystemPrompt,
    },
    {
      apiKey: requestAuth.apiKey,
      headers: requestAuth.headers,
      maxTokens: sessionTitleMaxTokens,
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
