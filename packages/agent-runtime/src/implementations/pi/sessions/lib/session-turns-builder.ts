import type {AgentSession, CustomEntry, SessionEntry, SessionMessageEntry} from "@mariozechner/pi-coding-agent";
import type {
  ModelReference,
  SessionTool,
  SessionToolTurnEvent,
  SessionTurn,
  SessionTurnEvent,
  SessionUserMessage,
} from "@pi-desktop/contracts/sessions/schemas";
import {sessionTurn} from "@pi-desktop/agent-runtime/implementations/shared/session-turns";
import {generateStableId} from "@pi-desktop/agent-runtime/implementations/shared/id-generator";
import {ATTACHMENTS_CUSTOM_TYPE} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/attachments/session-attachments";
import type {SessionAttachmentMetadata} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/attachments/session-attachments";
import {piContentToText, piUserAttachments} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/turns/message-content";
import {piToolSummary} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/turns/tool-events";

function isMessageEntry(entry: SessionEntry): entry is SessionMessageEntry {
  return entry.type === "message";
}

function isAttachmentsEntry(entry: SessionEntry): entry is CustomEntry<{attachments: SessionAttachmentMetadata[]}> {
  return entry.type === "custom" && entry.customType === ATTACHMENTS_CUSTOM_TYPE;
}

type PiMessageEntry<Role extends AgentSession["messages"][number]["role"]> = SessionMessageEntry & {message: Extract<AgentSession["messages"][number], {role: Role}>};

function isUserEntry(entry: SessionMessageEntry): entry is PiMessageEntry<"user"> {
  return entry.message.role === "user";
}

function isAssistantEntry(entry: SessionMessageEntry): entry is PiMessageEntry<"assistant"> {
  return entry.message.role === "assistant";
}

function isToolResultEntry(entry: SessionMessageEntry): entry is PiMessageEntry<"toolResult"> {
  return entry.message.role === "toolResult";
}

class PiTurnDraft {
  private readonly userMessage: SessionUserMessage;
  private readonly events: SessionTurnEvent[] = [];
  private readonly toolEventIndexes = new Map<string, {event: SessionToolTurnEvent; index: number}>();

  public constructor(userMessage: SessionUserMessage) {
    this.userMessage = userMessage;
  }

  public addAssistantEntry(entry: PiMessageEntry<"assistant">): boolean {
    const message = entry.message;
    const error = message.stopReason === "aborted" ? undefined : message.errorMessage;
    if (message.content.length === 0 && !error) return false;

    let eventWasAdded = false;

    for (const [partIndex, part] of message.content.entries()) {
      const id = generateStableId("evt", [entry.id, partIndex.toString(), part.type]);

      switch (part.type) {
        case "thinking":
          if (part.thinking.length > 0) {
            this.events.push({content: part.thinking, id, timestamp: entry.timestamp, type: "reasoning"});
            eventWasAdded = true;
          }
          break;
        case "text":
          if (part.text.length > 0) {
            this.events.push({content: part.text, id, timestamp: entry.timestamp, type: "assistant"});
            eventWasAdded = true;
          }
          break;
        case "toolCall": {
          const toolEvent: SessionToolTurnEvent = {
            id,
            timestamp: entry.timestamp,
            tool: {input: part.arguments, name: part.name, status: "pending", summary: piToolSummary(part.name)},
            type: "tool",
          };
          this.toolEventIndexes.set(part.id, {event: toolEvent, index: this.events.length});
          this.events.push(toolEvent);
          eventWasAdded = true;
          break;
        }
      }
    }

    if (error) {
      this.events.push({content: "", error, id: generateStableId("evt", [entry.id, message.content.length.toString(), "error"]), timestamp: entry.timestamp, type: "assistant"});
      eventWasAdded = true;
    }

    return eventWasAdded;
  }

  public addToolResultEntry(entry: PiMessageEntry<"toolResult">): boolean {
    const message = entry.message;
    const output = piContentToText(message.content);
    const completedTool: SessionTool = {
      error: message.isError ? output : undefined,
      name: message.toolName,
      output: message.isError ? undefined : output,
      status: message.isError ? "error" : "completed",
      summary: piToolSummary(message.toolName),
    };
    const toolEvent: SessionToolTurnEvent = {id: generateStableId("evt", [entry.id, "toolResult"]), timestamp: entry.timestamp, tool: completedTool, type: "tool"};
    const existingTool = this.toolEventIndexes.get(message.toolCallId);

    if (!existingTool) {
      this.events.push(toolEvent);
      return true;
    }

    this.events[existingTool.index] = {
      ...toolEvent,
      durationMs: new Date(entry.timestamp).getTime() - new Date(existingTool.event.timestamp).getTime(),
      id: existingTool.event.id,
      timestamp: existingTool.event.timestamp,
      tool: {...completedTool, input: existingTool.event.tool?.input},
    };
    return true;
  }

  public toTurn(model: ModelReference): SessionTurn {
    return sessionTurn({events: this.events, model, userMessage: this.userMessage});
  }
}

class PiSessionTurnBuilder {
  private readonly fallbackModel: ModelReference;
  private readonly turns: SessionTurn[] = [];
  private readonly attachmentsByParent = new Map<string, readonly SessionAttachmentMetadata[]>();
  private currentTurn: PiTurnDraft | undefined;

  public constructor(fallbackModel: ModelReference) {
    this.fallbackModel = fallbackModel;
  }

  public addEntry(entry: SessionEntry): boolean {
    if (isAttachmentsEntry(entry)) {
      this.attachmentsByParent.set(
        entry.id,
        [...(entry.data?.attachments ?? [])].sort((a, b) => a.order - b.order)
      );
      return true;
    }

    if (!isMessageEntry(entry)) return false;
    if (isUserEntry(entry)) return this.startUserTurn(entry);

    // A turn must be started by a user message. If there is no current turn,
    // assistant and tool result entries cannot be processed.
    if (!this.currentTurn) return false;

    if (isAssistantEntry(entry)) return this.currentTurn.addAssistantEntry(entry);
    if (isToolResultEntry(entry)) return this.currentTurn.addToolResultEntry(entry);

    return false;
  }

  public toTurns(): SessionTurn[] {
    if (!this.currentTurn) return [...this.turns];
    return [...this.turns, this.currentTurn.toTurn(this.fallbackModel)];
  }

  private startUserTurn(entry: PiMessageEntry<"user">): boolean {
    const content = piContentToText(entry.message.content);

    const attachments = entry.parentId ? this.attachmentsByParent.get(entry.parentId) : undefined;
    const normalizedAttachments = piUserAttachments(entry.message.content, attachments);

    if (content.length === 0 && !normalizedAttachments?.length) return false;

    this.completeCurrentTurn();
    this.currentTurn = new PiTurnDraft({attachments: normalizedAttachments, content, id: entry.id, timestamp: entry.timestamp});
    return true;
  }

  private completeCurrentTurn(): void {
    if (!this.currentTurn) return;
    this.turns.push(this.currentTurn.toTurn(this.fallbackModel));
    this.currentTurn = undefined;
  }
}

export function buildPiSessionTurns(entries: readonly SessionEntry[], fallbackModel: ModelReference): SessionTurn[] {
  const builder = new PiSessionTurnBuilder(fallbackModel);

  for (const entry of entries) {
    builder.addEntry(entry);
  }

  return builder.toTurns();
}
