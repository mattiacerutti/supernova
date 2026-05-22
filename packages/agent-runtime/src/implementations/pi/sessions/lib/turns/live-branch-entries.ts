import type {AgentSession, SessionEntry} from "@earendil-works/pi-coding-agent";
import type {UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {generateStableId} from "@supernova/agent-runtime/implementations/shared/id-generator";
import {USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE} from "@supernova/agent-runtime/implementations/pi/sessions/lib/user-message/content-parts";

type PiAgentMessage = AgentSession["messages"][number];

/** Creates synthetic Pi session entries for messages currently streaming on the live branch. */
export function createLiveBranchEntries(input: {
  contentPartsMetadata?: {readonly contentParts: readonly UserMessageContentPart[]};
  messages: readonly PiAgentMessage[];
  parentId: string | null;
  sessionId: string;
}): SessionEntry[] {
  let parentId = input.parentId;
  let nextId = 0;
  const entries: SessionEntry[] = [];

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
