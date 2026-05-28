import type {CompactionEntry, CustomEntry, SessionEntry, SessionMessageEntry} from "@earendil-works/pi-coding-agent";
import type {AssistantMessage, ToolResultMessage, UserMessage as PiUserMessage} from "@earendil-works/pi-ai";
import type {CompactionTurnEvent, ModelReference, ToolTurnEvent, Turn, TurnEvent, UserMessage} from "@supernova/contracts/sessions/schemas";
import {generateStableId} from "@supernova/agent-runtime/implementations/pi/shared/lib/id-generator";
import {createTurn} from "@supernova/agent-runtime/implementations/pi/shared/lib/turns";
import {PiToolInvocationFactory} from "@supernova/agent-runtime/implementations/pi/shared/lib/turns/tool-invocation-factory";
import type {PiToolInvocation} from "@supernova/agent-runtime/implementations/pi/shared/lib/turns/tool-invocation-factory";
import {USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE, enrichContentPartsWithImages} from "@supernova/agent-runtime/implementations/pi/shared/lib/user-message/content-parts";

type UserMessageEntry = SessionMessageEntry & {message: PiUserMessage};
type AssistantMessageEntry = SessionMessageEntry & {message: AssistantMessage};
type ToolResultMessageEntry = SessionMessageEntry & {message: ToolResultMessage};

function isUserEntry(entry: SessionMessageEntry): entry is UserMessageEntry {
  return entry.message.role === "user";
}

function isAssistantEntry(entry: SessionMessageEntry): entry is AssistantMessageEntry {
  return entry.message.role === "assistant";
}

function isToolResultEntry(entry: SessionMessageEntry): entry is ToolResultMessageEntry {
  return entry.message.role === "toolResult";
}

function isMessageEntry(entry: SessionEntry): entry is SessionMessageEntry {
  return entry.type === "message";
}

function isContentPartsEntry(entry: SessionEntry): entry is CustomEntry<{readonly contentParts: UserMessage["contentParts"]}> {
  return entry.type === "custom" && entry.customType === USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE;
}

function isCompactionEntry(entry: SessionEntry): entry is CompactionEntry {
  return entry.type === "compaction";
}

/** Collects events for one user-started turn before finalizing it. */
class PiTurnDraft {
  private readonly userMessage: UserMessage;
  private readonly events: TurnEvent[] = [];
  private readonly toolEventIndexes = new Map<string, {event: ToolTurnEvent; index: number; invocation: PiToolInvocation}>();

  public constructor(userMessage: UserMessage) {
    this.userMessage = userMessage;
  }

  /** Appends assistant content, reasoning, tool calls, and assistant errors as turn events. */
  public addAssistantEntry(entry: AssistantMessageEntry): boolean {
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
          const invocation = PiToolInvocationFactory.create(part.name, part.arguments);
          const toolEvent: ToolTurnEvent = {
            id,
            timestamp: entry.timestamp,
            tool: invocation.toTool(),
            type: "tool",
          };
          this.toolEventIndexes.set(part.id, {event: toolEvent, index: this.events.length, invocation});
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

  /** Completes a matching tool call event or appends an orphan tool result event. */
  public addToolResultEntry(entry: ToolResultMessageEntry): boolean {
    const message = entry.message;
    const completion = {details: message.details, isError: Boolean(message.isError), output: message.content};

    const existingTool = this.toolEventIndexes.get(message.toolCallId);
    const invocation = existingTool?.invocation ?? PiToolInvocationFactory.create(message.toolName, undefined);

    invocation.complete(completion);

    const completedTool = invocation.toTool();
    const toolEvent: ToolTurnEvent = {id: generateStableId("evt", [entry.id, "toolResult"]), timestamp: entry.timestamp, tool: completedTool, type: "tool"};

    if (!existingTool) {
      this.events.push(toolEvent);
      return true;
    }

    this.events[existingTool.index] = {
      ...toolEvent,
      durationMs: new Date(entry.timestamp).getTime() - new Date(existingTool.event.timestamp).getTime(),
      id: existingTool.event.id,
      timestamp: existingTool.event.timestamp,
      tool: completedTool,
    };
    return true;
  }

  /** Appends a context compaction event to the active turn. */
  public addCompactionEntry(entry: CompactionEntry): boolean {
    // Since compaction entry is not persisted until it is completed, a pending compaction entry
    // is created by synthetically with no data.
    const pending = entry.summary.length === 0 && entry.firstKeptEntryId.length === 0 && entry.tokensBefore === 0;

    const event = {
      id: entry.id,
      status: pending ? "pending" : "completed",
      ...(pending ? {} : {summary: entry.summary}),
      timestamp: entry.timestamp,
      type: "compaction",
    } satisfies CompactionTurnEvent;

    this.events.push(event);

    return true;
  }

  /** Finalizes the draft into a shared turn. */
  public toTurn(model: ModelReference): Turn {
    return createTurn({events: this.events, model, userMessage: this.userMessage});
  }
}

/** Builds ordered turns while preserving Pi parent/metadata relationships. */
class PiTurnBuilder {
  private readonly fallbackModel: ModelReference;
  private readonly turns: Turn[] = [];
  private currentTurn: PiTurnDraft | undefined;
  private pendingContentParts: UserMessage["contentParts"] = [];

  private pendingCompactionEntries: CompactionEntry[] = [];

  public constructor(fallbackModel: ModelReference) {
    this.fallbackModel = fallbackModel;
  }

  /** Adds one Pi session entry to the current turn-building state. */
  public addEntry(entry: SessionEntry): boolean {
    if (isContentPartsEntry(entry)) {
      this.completeCurrentTurn();
      this.pendingContentParts = [...(entry.data?.contentParts ?? [])];
      return true;
    }

    if (isCompactionEntry(entry)) {
      if (!this.currentTurn) {
        this.pendingCompactionEntries.push(entry);
        return true;
      }

      return this.currentTurn.addCompactionEntry(entry);
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

  /** Returns completed turns plus the active in-progress turn, if any. */
  public toTurns(): Turn[] {
    if (!this.currentTurn) return [...this.turns];
    return [...this.turns, this.currentTurn.toTurn(this.fallbackModel)];
  }

  private startUserTurn(entry: UserMessageEntry): boolean {
    if (this.pendingContentParts.length === 0) return false;

    this.completeCurrentTurn();
    this.currentTurn = new PiTurnDraft({
      contentParts: enrichContentPartsWithImages({content: entry.message.content, contentParts: this.pendingContentParts}),
      id: entry.id,
      timestamp: entry.timestamp,
    });
    this.pendingContentParts = [];
    for (const entry of this.pendingCompactionEntries) {
      this.currentTurn.addCompactionEntry(entry);
    }
    this.pendingCompactionEntries = [];
    return true;
  }

  private completeCurrentTurn(): void {
    if (!this.currentTurn) return;
    this.turns.push(this.currentTurn.toTurn(this.fallbackModel));
    this.currentTurn = undefined;
  }
}

/** Builds normalized turns from Pi session entries. */
export function buildPiTurns(entries: readonly SessionEntry[], fallbackModel: ModelReference): Turn[] {
  const builder = new PiTurnBuilder(fallbackModel);

  for (const entry of entries) {
    builder.addEntry(entry);
  }

  return builder.toTurns();
}
