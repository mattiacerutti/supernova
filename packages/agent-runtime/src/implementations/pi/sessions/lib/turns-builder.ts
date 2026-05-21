import type {AgentSession, CustomEntry, SessionEntry, SessionMessageEntry} from "@earendil-works/pi-coding-agent";
import type {ModelReference, ToolTurnEvent, Turn, TurnEvent, UserMessage} from "@supernova/contracts/sessions/schemas";
import {createTurn} from "@supernova/agent-runtime/implementations/shared/turns";
import {generateStableId} from "@supernova/agent-runtime/implementations/shared/id-generator";
import {PiToolInvocationFactory} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns/tool-invocation-factory";
import type {PiToolInvocation} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns/tool-invocation-factory";
import {USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE, enrichContentPartsWithImages} from "@supernova/agent-runtime/implementations/pi/sessions/lib/message-context/content-parts";

function isMessageEntry(entry: SessionEntry): entry is SessionMessageEntry {
  return entry.type === "message";
}

function isContentPartsEntry(entry: SessionEntry): entry is CustomEntry<{readonly contentParts: UserMessage["contentParts"]}> {
  return entry.type === "custom" && entry.customType === USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE;
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

/** Collects events for one user-started turn before finalizing it. */
class PiTurnDraft {
  private readonly userMessage: UserMessage;
  private readonly events: TurnEvent[] = [];
  private readonly toolEventIndexes = new Map<string, {event: ToolTurnEvent; index: number; invocation: PiToolInvocation}>();

  public constructor(userMessage: UserMessage) {
    this.userMessage = userMessage;
  }

  /** Appends assistant content, reasoning, tool calls, and assistant errors as turn events. */
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
  public addToolResultEntry(entry: PiMessageEntry<"toolResult">): boolean {
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

  /** Finalizes the draft into a shared turn. */
  public toTurn(model: ModelReference): Turn {
    return createTurn({events: this.events, model, userMessage: this.userMessage});
  }
}

/** Builds ordered turns while preserving Pi parent/metadata relationships. */
class PiTurnBuilder {
  private readonly fallbackModel: ModelReference;
  private readonly turns: Turn[] = [];
  private readonly contentPartsByParent = new Map<string, {readonly contentParts: UserMessage["contentParts"]}>();
  private readonly parentByEntryId = new Map<string, string | null>();
  private currentTurn: PiTurnDraft | undefined;

  public constructor(fallbackModel: ModelReference) {
    this.fallbackModel = fallbackModel;
  }

  /** Adds one Pi session entry to the current turn-building state. */
  public addEntry(entry: SessionEntry): boolean {
    this.parentByEntryId.set(entry.id, entry.parentId);

    if (isContentPartsEntry(entry)) {
      this.contentPartsByParent.set(entry.id, {contentParts: entry.data?.contentParts ?? []});
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

  /** Returns completed turns plus the active in-progress turn, if any. */
  public toTurns(): Turn[] {
    if (!this.currentTurn) return [...this.turns];
    return [...this.turns, this.currentTurn.toTurn(this.fallbackModel)];
  }

  private startUserTurn(entry: PiMessageEntry<"user">): boolean {
    const metadata = this.findParentMetadata(entry.parentId, this.contentPartsByParent);
    if (!metadata?.contentParts.length) return false;

    this.completeCurrentTurn();
    this.currentTurn = new PiTurnDraft({
      contentParts: enrichContentPartsWithImages({content: entry.message.content, contentParts: metadata.contentParts}),
      id: entry.id,
      timestamp: entry.timestamp,
    });
    return true;
  }

  /** Walks parent links to find metadata associated with an ancestor entry. */
  private findParentMetadata<T>(parentId: string | null, metadataByParent: ReadonlyMap<string, T>): T | undefined {
    let currentParentId = parentId;
    while (currentParentId) {
      const metadata = metadataByParent.get(currentParentId);
      if (metadata) return metadata;
      currentParentId = this.parentByEntryId.get(currentParentId) ?? null;
    }

    return undefined;
  }

  private completeCurrentTurn(): void {
    if (!this.currentTurn) return;
    this.turns.push(this.currentTurn.toTurn(this.fallbackModel));
    this.currentTurn = undefined;
  }
}

/** Builds normalized Supernova turns from Pi session entries. */
export function buildPiTurns(entries: readonly SessionEntry[], fallbackModel: ModelReference): Turn[] {
  const builder = new PiTurnBuilder(fallbackModel);

  for (const entry of entries) {
    builder.addEntry(entry);
  }

  return builder.toTurns();
}
