import type {AgentSession, SessionEntry} from "@earendil-works/pi-coding-agent";
import type {UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {generateStableId} from "@supernova/agent-runtime/implementations/shared/id-generator";
import {USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE} from "@supernova/agent-runtime/implementations/pi/sessions/lib/user-message/content-parts";

type PiAgentMessage = AgentSession["messages"][number];

function textFromContentParts(contentParts: readonly UserMessageContentPart[]): string {
  return contentParts.map((part) => (part.type === "text" ? part.text : part.type === "reference" ? part.value : "")).join("");
}

/** Creates synthetic Pi session entries for messages currently streaming on the live branch. */
export function createLiveBranchEntries(input: {
  contentParts?: readonly UserMessageContentPart[];
  messages: readonly PiAgentMessage[];
  parentId: string | null;
  sessionId: string;
}): SessionEntry[] {
  let parentId = input.parentId;
  let nextId = 0;
  const entries: SessionEntry[] = [];
  const timestamp = new Date(input.messages[0]?.timestamp ?? Date.now()).toISOString();

  if (input.contentParts?.length) {
    const id = generateStableId("live", [input.sessionId, input.parentId ?? "root", (nextId++).toString()]);
    entries.push({
      customType: USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE,
      data: {contentParts: input.contentParts},
      id,
      parentId,
      timestamp,
      type: "custom",
    });
    parentId = id;

    // Pre-prompt compaction can emit snapshots before Pi emits the submitted user message;
    // add a synthetic anchor so the optimistic user turn stays visible during compaction.
    if (!input.messages.some((message) => message.role === "user")) {
      const messageId = generateStableId("live", [input.sessionId, input.parentId ?? "root", (nextId++).toString()]);

      entries.push({
        id: messageId,
        message: {content: [{text: textFromContentParts(input.contentParts), type: "text"}], role: "user", timestamp: new Date(timestamp).getTime()},
        parentId,
        timestamp,
        type: "message",
      });

      parentId = messageId;
    }
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
    } else if (message.role === "compactionSummary") {
      entries.push({
        id,
        parentId,
        summary: message.summary,
        timestamp: new Date(message.timestamp).toISOString(),
        tokensBefore: message.tokensBefore,
        // `compactionSummary` messages do not expose `firstKeptEntryId`; synthetic entries are display-only.
        firstKeptEntryId: "",
        type: "compaction",
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
