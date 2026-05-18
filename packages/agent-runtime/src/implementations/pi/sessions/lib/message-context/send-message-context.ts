import type {AgentSession} from "@earendil-works/pi-coding-agent";
import type {SessionMessageSendPayload} from "@supernova/contracts/sessions/procedures";
import type {SessionUserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {ATTACHMENTS_CUSTOM_TYPE, TEXT_ATTACHMENTS_CUSTOM_TYPE, prepareAttachments} from "@supernova/agent-runtime/implementations/pi/sessions/lib/message-context/attachments";
import type {Attachments} from "@supernova/agent-runtime/implementations/pi/sessions/lib/message-context/attachments";
import {USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE, validContentParts} from "@supernova/agent-runtime/implementations/pi/sessions/lib/message-context/content-parts";

type PiCustomMessage = Extract<AgentSession["messages"][number], {role: "custom"}>;

export type SendMessageContextCustomEntry =
  | {readonly customType: typeof ATTACHMENTS_CUSTOM_TYPE; readonly data: {readonly attachments: Attachments["metadata"]}}
  | {readonly customType: typeof USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE; readonly data: {readonly contentParts: readonly SessionUserMessageContentPart[]}};

export interface PreparedSendMessageContext {
  readonly attachments: Attachments;
  readonly contentParts: readonly SessionUserMessageContentPart[];
  readonly customEntries: readonly SendMessageContextCustomEntry[];
  readonly textAttachmentMessage: Omit<PiCustomMessage, "role" | "timestamp"> | undefined;
}

export function prepareSendMessageContext(input: SessionMessageSendPayload): PreparedSendMessageContext {
  const attachments = prepareAttachments(input.attachments);
  const contentParts = validContentParts(input.message, input.contentParts) ?? [];
  const customEntries: SendMessageContextCustomEntry[] = [];

  if (attachments.metadata.length > 0) {
    customEntries.push({customType: ATTACHMENTS_CUSTOM_TYPE, data: {attachments: attachments.metadata}});
  }

  if (contentParts.length > 0) {
    customEntries.push({customType: USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE, data: {contentParts}});
  }

  return {
    attachments,
    contentParts,
    customEntries,
    textAttachmentMessage: attachments.textContent
      ? {
          content: attachments.textContent,
          customType: TEXT_ATTACHMENTS_CUSTOM_TYPE,
          details: {attachmentIds: attachments.metadata.filter((attachment) => attachment.kind === "text").map((attachment) => attachment.id)},
          display: false,
        }
      : undefined,
  };
}
