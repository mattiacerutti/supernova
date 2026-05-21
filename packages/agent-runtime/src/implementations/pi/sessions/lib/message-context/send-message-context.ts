import type {ImageContent} from "@earendil-works/pi-ai";
import type {SessionMessageSendPayload} from "@supernova/contracts/sessions/procedures";
import type {SessionUserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE, imageContentFromParts} from "@supernova/agent-runtime/implementations/pi/sessions/lib/message-context/content-parts";
import {buildPrompt} from "@supernova/agent-runtime/implementations/pi/sessions/lib/message-context/prompt-builder";

export type SendMessageContextCustomEntry = {
  readonly customType: typeof USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE;
  readonly data: {readonly contentParts: readonly SessionUserMessageContentPart[]};
};

export interface SendMessageContext {
  readonly contentParts: readonly SessionUserMessageContentPart[];
  readonly customEntries: readonly SendMessageContextCustomEntry[];
  readonly images: readonly ImageContent[];
  readonly prompt: string;
}

export async function prepareSendMessageContext(input: SessionMessageSendPayload, options: {projectPath: string}): Promise<SendMessageContext> {
  // Strip base64 content from attachments since it's persisted separately for images and not needed for other attachments types.
  const contentParts = input.contentParts.map((part) => (part.type === "attachment" ? {...part, contentBase64: undefined} : part));

  const prompt = await buildPrompt({contentParts: input.contentParts, projectPath: options.projectPath});
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
