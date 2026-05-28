import type {ImageContent} from "@earendil-works/pi-ai";
import type {SendMessagePayload} from "@supernova/contracts/sessions/procedures";
import type {UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import type {PiResourceCatalogShape} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-resource-catalog";
import {USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE, imageContentFromParts} from "@supernova/agent-runtime/implementations/pi/shared/lib/user-message/content-parts";
import {buildPrompt} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/user-message/prompt-builder";

export type SendMessageContextCustomEntry = {
  readonly customType: typeof USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE;
  readonly data: {readonly contentParts: readonly UserMessageContentPart[]};
};

export interface SendMessageContext {
  readonly contentParts: readonly UserMessageContentPart[];
  readonly customEntries: readonly SendMessageContextCustomEntry[];
  readonly images: readonly ImageContent[];
  readonly prompt: string;
}

/** Prepares the Pi prompt, image content, and persisted metadata for a send-message request. */
export async function prepareSendMessageContext(input: SendMessagePayload, options: {projectPath: string; resourceCatalog: PiResourceCatalogShape}): Promise<SendMessageContext> {
  // Strip base64 content from attachments since it's persisted separately for images and not needed for other attachments types.
  const contentParts = input.contentParts.map((part) => (part.type === "attachment" ? {...part, contentBase64: undefined} : part));

  const prompt = await buildPrompt({contentParts: input.contentParts, projectPath: options.projectPath, resourceCatalog: options.resourceCatalog});
  const customEntries: SendMessageContextCustomEntry[] = [];

  if (contentParts.length > 0) {
    customEntries.push({customType: USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE, data: {contentParts}});
  }

  return {
    contentParts,
    customEntries,
    images: imageContentFromParts(input.contentParts),
    prompt,
  };
}
