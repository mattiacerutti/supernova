import type {AgentSession, CustomEntry, SessionEntry, SessionMessageEntry} from "@mariozechner/pi-coding-agent";
import type {
  AgentSessionAttachment,
  AgentModelReference,
  AgentSessionTool,
  AgentSessionToolTurnEvent,
  AgentSessionTurn,
  AgentSessionTurnEvent,
  AgentSessionUserMessage,
} from "@pi-desktop/contracts/sessions/schemas";
import {sessionTurn} from "@pi-desktop/agent-runtime/implementations/shared/session-turns";

import type {ImageContent, TextContent} from "@mariozechner/pi-ai";
import {ATTACHMENTS_CUSTOM_TYPE} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/session-attachments";
import type {SessionAttachmentMetadata} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/session-attachments";

type PiAgentMessage = AgentSession["messages"][number];

function isMessageEntry(entry: SessionEntry): entry is SessionMessageEntry {
  return entry.type === "message";
}

function isAttachmentsEntry(entry: SessionEntry): entry is CustomEntry<{attachments: SessionAttachmentMetadata[]}> {
  return entry.type === "custom" && entry.customType === ATTACHMENTS_CUSTOM_TYPE;
}

export function createSyntheticBranchEntries(input: {
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

function partsToText(content: string | (TextContent | ImageContent)[]): string {
  if (typeof content === "string") return content;

  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

function userAttachments(content: string | (TextContent | ImageContent)[], metadata: readonly SessionAttachmentMetadata[] | undefined): AgentSessionAttachment[] | undefined {
  if (!metadata?.length) return;

  const images = typeof content === "string" ? [] : content.filter((p): p is ImageContent => p.type === "image");
  let imageIndex = 0;

  return metadata.map((a) => {
    const base: AgentSessionAttachment = {id: a.id, mime: a.mime, name: a.name, size: a.size};
    if (a.kind !== "image") return base;
    const image = images[imageIndex++];
    return image ? {...base, contentBase64: image.data} : base;
  });
}

function toolSummary(toolName: string): string {
  switch (toolName) {
    case "bash":
      return "Ran command";
    case "ls":
      return "Listed files";
    case "read":
      return "Read file";
    case "edit":
    case "write":
      return "Edited file";
    case "find":
    case "grep":
      return "Explored files";
    default:
      return `Ran ${toolName}`;
  }
}

export function normalizePiSessionTurns(entries: readonly SessionEntry[], fallbackModel: AgentModelReference): AgentSessionTurn[] {
  const turns: AgentSessionTurn[] = [];
  let currentUser: AgentSessionUserMessage | undefined;
  let currentEvents: AgentSessionTurnEvent[] = [];
  const toolEventIndexes = new Map<string, {event: AgentSessionToolTurnEvent; index: number}>();

  const attachmentsByParent = new Map<string, readonly SessionAttachmentMetadata[]>();

  const flush = (): void => {
    if (!currentUser) return;
    turns.push(sessionTurn({events: currentEvents, model: fallbackModel, userMessage: currentUser}));
    currentEvents = [];
    toolEventIndexes.clear();
  };

  const ensureUser = (id: string, timestamp: string): void => {
    currentUser ??= {content: "", id: `implicit-user-${id}`, timestamp};
  };

  for (const entry of entries) {
    if (isAttachmentsEntry(entry)) {
      attachmentsByParent.set(
        entry.id,
        (entry.data?.attachments ?? []).sort((a, b) => a.order - b.order)
      );
      continue;
    }

    if (!isMessageEntry(entry)) continue;

    const message = entry.message;
    const timestamp = entry.timestamp;
    const id = entry.id;

    switch (message.role) {
      case "user": {
        const content = partsToText(message.content);
        const attachments = entry.parentId ? attachmentsByParent.get(entry.parentId) : undefined;
        const normalizedAttachments = userAttachments(message.content, attachments);
        if (content.length === 0 && !normalizedAttachments?.length) break;
        flush();
        currentUser = {attachments: normalizedAttachments, content, id, timestamp};
        break;
      }
      case "assistant": {
        // Pi records user-initiated stops as aborted assistant errors.
        // The UI renders the preserved partial turn instead of showing that as a failure.
        const error = message.stopReason === "aborted" ? undefined : message.errorMessage;
        if (message.content.length === 0 && !error) break;
        ensureUser(id, timestamp);

        // TODO: Pi persists one timestamp for the whole assistant message, not per content part.
        // We still split thinking/text/toolCall parts into separate contract events to preserve
        // their display order, but those events necessarily share this message timestamp.
        // As a result, work duration between a reasoning part and the following text part can
        // collapse to 0ms. This should be fixed on Pi side by allowing per-part timestamps.
        for (const [partIndex, part] of message.content.entries()) {
          switch (part.type) {
            case "thinking": {
              if (part.thinking.length > 0) {
                currentEvents.push({
                  id: `${id}-reasoning-${partIndex}`,
                  type: "reasoning",
                  content: part.thinking,
                  timestamp,
                });
              }
              break;
            }
            case "text": {
              if (part.text.length > 0) {
                currentEvents.push({
                  id: `${id}-text-${partIndex}`,
                  type: "assistant",
                  content: part.text,
                  timestamp,
                });
              }
              break;
            }
            case "toolCall": {
              const toolName = part.name;
              const toolEvent: AgentSessionToolTurnEvent = {
                id: `${id}-tool-${partIndex}-${part.id}`,
                timestamp,
                tool: {
                  input: part.arguments,
                  name: toolName,
                  status: "pending",
                  summary: toolSummary(toolName),
                },
                type: "tool",
              };
              toolEventIndexes.set(part.id, {event: toolEvent, index: currentEvents.length});
              currentEvents.push(toolEvent);
              break;
            }
          }
        }

        if (error) {
          currentEvents.push({content: "", error, id: `${id}-error`, timestamp, type: "assistant"});
        }
        break;
      }
      case "toolResult": {
        const output = partsToText(message.content);

        const completedTool: AgentSessionTool = {
          name: message.toolName,
          status: message.isError ? "error" : "completed",
          output: message.isError ? undefined : output,
          summary: toolSummary(message.toolName),
          error: message.isError ? output : undefined,
        };

        ensureUser(id, timestamp);
        const toolEvent: AgentSessionToolTurnEvent = {
          id,
          timestamp,
          tool: completedTool,
          type: "tool",
        };

        const existingTool = toolEventIndexes.get(message.toolCallId);

        if (!existingTool) {
          currentEvents.push(toolEvent);
          break;
        }

        currentEvents[existingTool.index] = {
          ...toolEvent,
          durationMs: new Date(timestamp).getTime() - new Date(existingTool.event.timestamp).getTime(),
          id: existingTool.event.id,
          timestamp: existingTool.event.timestamp,
          tool: {...completedTool, input: existingTool.event.tool?.input},
        };
        break;
      }
    }
  }

  flush();
  return turns;
}
