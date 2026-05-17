import type {AgentSession, SessionEntry} from "@mariozechner/pi-coding-agent";
import {generateStableId} from "@pi-desktop/agent-runtime/implementations/shared/id-generator";
import type {SessionUserMessageContentPart} from "@pi-desktop/contracts/sessions/schemas";
import {ATTACHMENTS_CUSTOM_TYPE} from "@/implementations/pi/sessions/lib/message-context/attachments";
import type {AttachmentMetadata} from "@/implementations/pi/sessions/lib/message-context/attachments";
import {USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE} from "@/implementations/pi/sessions/lib/message-context/content-parts";

type PiAgentMessage = AgentSession["messages"][number];

export function createLiveBranchEntries(input: {
  attachmentMetadata?: {attachments: readonly AttachmentMetadata[]};
  contentPartsMetadata?: {contentParts: readonly SessionUserMessageContentPart[]};
  messages: readonly PiAgentMessage[];
  parentId: string | null;
  sessionId: string;
}): SessionEntry[] {
  let parentId = input.parentId;
  let nextId = 0;
  const entries: SessionEntry[] = [];

  if (input.attachmentMetadata?.attachments.length) {
    const id = generateStableId("live", [input.sessionId, input.parentId ?? "root", (nextId++).toString()]);
    entries.push({
      customType: ATTACHMENTS_CUSTOM_TYPE,
      data: input.attachmentMetadata,
      id,
      parentId,
      timestamp: new Date(input.messages[0]?.timestamp ?? Date.now()).toISOString(),
      type: "custom",
    });
    parentId = id;
  }

  if (input.contentPartsMetadata?.contentParts.length) {
    const id = generateStableId("live", [input.sessionId, input.parentId ?? "root", (nextId++).toString()]);
    entries.push({
      customType: USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE,
      data: input.contentPartsMetadata,
      id,
      parentId,
      timestamp: new Date(input.messages[0]?.timestamp ?? Date.now()).toISOString(),
      type: "custom",
    });
    parentId = id;
  }

  for (const message of input.messages) {
    const id = generateStableId("live", [input.sessionId, input.parentId ?? "root", (nextId++).toString()]);

    if (message.role === "custom") {
      entries.push({
        content: message.content,
        customType: message.customType,
        details: message.details,
        display: message.display,
        id,
        parentId,
        timestamp: new Date(message.timestamp).toISOString(),
        type: "custom_message",
      });
    } else {
      entries.push({
        id,
        message,
        parentId,
        timestamp: new Date(message.timestamp).toISOString(),
        type: "message",
      });
    }

    parentId = id;
  }

  return entries;
}
