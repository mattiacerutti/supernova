import type {ImageContent} from "@earendil-works/pi-ai";
import type {SendMessagePayload} from "@supernova/contracts/services/session-runtime/procedures";
import type {UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import {imageContentFromParts} from "@supernova/agent-runtime/pi/lib/user-message/content-parts";
import {buildPrompt} from "@supernova/agent-runtime/features/session-runtime/worker/lib/prompt-builder";

export interface SendMessageContext {
  /** The authored content as the timeline shows it; attachment payloads are stripped. */
  readonly contentParts: readonly UserMessageContentPart[];
  readonly images: readonly ImageContent[];
  readonly prompt: string;
}

/** Prepares the model-facing prompt and images, and the authored content stored for display. */
export async function prepareSendMessageContext(input: SendMessagePayload, options: {projectPath: string; resourceCache: ResourceCache}): Promise<SendMessageContext> {
  // Strip base64 content: images are restored from the user message for display, other attachments are inlined.
  const contentParts = input.contentParts.map((part) => (part.type === "attachment" ? {...part, contentBase64: undefined} : part));
  const prompt = await buildPrompt({contentParts: input.contentParts, projectPath: options.projectPath, resourceCache: options.resourceCache});
  return {contentParts, images: imageContentFromParts(input.contentParts), prompt};
}
