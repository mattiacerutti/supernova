import type {AgentSession, SessionEntry} from "@mariozechner/pi-coding-agent";
import {ATTACHMENTS_CUSTOM_TYPE} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/attachments/session-attachments";
import type {SessionAttachmentMetadata} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/attachments/session-attachments";

type PiAgentMessage = AgentSession["messages"][number];

export function createLiveBranchEntries(input: {
  attachmentMetadata?: {attachments: readonly SessionAttachmentMetadata[]};
  messages: readonly PiAgentMessage[];
  parentId: string | null;
}): SessionEntry[] {
  let parentId = input.parentId;
  const entries: SessionEntry[] = [];

  if (input.attachmentMetadata?.attachments.length) {
    const id = "synthetic-attachments";
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

  for (const [index, message] of input.messages.entries()) {
    const id = `synthetic-${index}-${message.role}`;

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
