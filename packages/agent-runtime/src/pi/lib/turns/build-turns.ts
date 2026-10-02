import type {AssistantMessage, ToolResultMessage, UserMessage as PiUserMessage} from "@earendil-works/pi-ai";
import type {CompactionTurnEvent, ModelReference, ToolTurnEvent, Turn, TurnEvent, UserMessage} from "@supernova/contracts/sessions/schemas";
import {generateStableId} from "@supernova/agent-runtime/lib/id-generator";
import {createTurn} from "@supernova/agent-runtime/pi/lib/turns/turns";
import {PiToolInvocationFactory} from "@supernova/agent-runtime/pi/lib/turns/tool-invocation-factory";
import type {PiToolInvocation} from "@supernova/agent-runtime/pi/lib/turns/tool-invocation-factory";
import {enrichContentPartsWithImages} from "@supernova/agent-runtime/pi/lib/user-message/content-parts";

/**
 * One transcript record as the timeline sees it, independent of where it is stored. The engine's entries and the
 * legacy JSONL reader both map onto it, so persisted, live, and legacy turns follow the same rules.
 */
export type TimelineEntry =
  | {readonly type: "content-parts"; readonly id: string; readonly timestamp: string; readonly contentParts: UserMessage["contentParts"]}
  | {readonly type: "user"; readonly id: string; readonly timestamp: string; readonly message: PiUserMessage}
  | {readonly type: "assistant"; readonly id: string; readonly timestamp: string; readonly message: AssistantMessage}
  | {readonly type: "tool-result"; readonly id: string; readonly timestamp: string; readonly message: ToolResultMessage}
  /** `summary` is undefined while the compaction is still running. */
  | {readonly type: "compaction"; readonly id: string; readonly timestamp: string; readonly summary: string | undefined};

type AssistantEntry = Extract<TimelineEntry, {type: "assistant"}>;
type ToolResultEntry = Extract<TimelineEntry, {type: "tool-result"}>;
type CompactionEntry = Extract<TimelineEntry, {type: "compaction"}>;
type UserEntry = Extract<TimelineEntry, {type: "user"}>;

/** Collects events for one user-started turn before finalizing it. */
class TurnDraft {
  private readonly userMessage: UserMessage;
  private readonly events: TurnEvent[] = [];
  private readonly toolEventIndexes = new Map<string, {event: ToolTurnEvent; index: number; invocation: PiToolInvocation}>();

  public constructor(userMessage: UserMessage) {
    this.userMessage = userMessage;
  }

  /** Appends assistant content, reasoning, tool calls, and assistant errors as turn events. */
  public addAssistantEntry(entry: AssistantEntry): void {
    const message = entry.message;
    const error = message.stopReason === "aborted" ? undefined : message.errorMessage;
    if (message.content.length === 0 && !error) return;

    for (const [partIndex, part] of message.content.entries()) {
      const id = generateStableId("evt", [entry.id, partIndex.toString(), part.type]);

      switch (part.type) {
        case "thinking":
          if (part.thinking.length > 0) this.events.push({content: part.thinking, id, timestamp: entry.timestamp, type: "reasoning"});
          break;
        case "text":
          if (part.text.length > 0) this.events.push({content: part.text, id, timestamp: entry.timestamp, type: "assistant"});
          break;
        case "toolCall": {
          const invocation = PiToolInvocationFactory.create(part.name, part.arguments);
          const toolEvent: ToolTurnEvent = {id, timestamp: entry.timestamp, tool: invocation.toTool(), type: "tool"};
          this.toolEventIndexes.set(part.id, {event: toolEvent, index: this.events.length, invocation});
          this.events.push(toolEvent);
          break;
        }
      }
    }

    if (error) {
      this.events.push({content: "", error, id: generateStableId("evt", [entry.id, message.content.length.toString(), "error"]), timestamp: entry.timestamp, type: "assistant"});
    }
  }

  /** Completes a matching tool call event or appends an orphan tool result event. */
  public addToolResultEntry(entry: ToolResultEntry): void {
    const message = entry.message;
    const completion = {details: message.details, isError: Boolean(message.isError), output: message.content};

    const existingTool = this.toolEventIndexes.get(message.toolCallId);
    const invocation = existingTool?.invocation ?? PiToolInvocationFactory.create(message.toolName, undefined);
    invocation.complete(completion);

    const completedTool = invocation.toTool();
    const toolEvent: ToolTurnEvent = {id: generateStableId("evt", [entry.id, "toolResult"]), timestamp: entry.timestamp, tool: completedTool, type: "tool"};

    if (!existingTool) {
      this.events.push(toolEvent);
      return;
    }

    this.events[existingTool.index] = {
      ...toolEvent,
      durationMs: new Date(entry.timestamp).getTime() - new Date(existingTool.event.timestamp).getTime(),
      id: existingTool.event.id,
      timestamp: existingTool.event.timestamp,
      tool: completedTool,
    };
  }

  /** Appends a context compaction event; one without a summary is still running. */
  public addCompactionEntry(entry: CompactionEntry): void {
    const pending = entry.summary === undefined;
    this.events.push({
      id: entry.id,
      status: pending ? "pending" : "completed",
      ...(pending ? {} : {summary: entry.summary}),
      timestamp: entry.timestamp,
      type: "compaction",
    } satisfies CompactionTurnEvent);
  }

  /** Finalizes the draft into a shared turn. */
  public toTurn(modelReference: ModelReference): Turn {
    return createTurn({events: this.events, modelReference, userMessage: this.userMessage});
  }
}

/** Builds ordered turns: a turn starts at a user entry preceded by its authored content parts. */
class TurnBuilder {
  private readonly turns: Turn[] = [];
  private currentTurn: TurnDraft | undefined;
  private pendingContentParts: UserMessage["contentParts"] = [];
  private pendingCompactionEntries: CompactionEntry[] = [];

  public constructor(private readonly fallbackModel: ModelReference) {}

  public addEntry(entry: TimelineEntry): void {
    switch (entry.type) {
      case "content-parts":
        this.completeCurrentTurn();
        this.pendingContentParts = [...entry.contentParts];
        return;
      case "compaction":
        if (this.currentTurn) this.currentTurn.addCompactionEntry(entry);
        else this.pendingCompactionEntries.push(entry);
        return;
      case "user":
        this.startUserTurn(entry);
        return;
      case "assistant":
        // A turn must be started by a user message; earlier assistant and tool entries have no turn.
        this.currentTurn?.addAssistantEntry(entry);
        return;
      case "tool-result":
        this.currentTurn?.addToolResultEntry(entry);
        return;
    }
  }

  public toTurns(): Turn[] {
    if (!this.currentTurn) return [...this.turns];
    return [...this.turns, this.currentTurn.toTurn(this.fallbackModel)];
  }

  private startUserTurn(entry: UserEntry): void {
    // User messages Supernova did not author (an extension's or a compaction's) do not start a turn.
    if (this.pendingContentParts.length === 0) return;

    this.completeCurrentTurn();
    this.currentTurn = new TurnDraft({
      contentParts: enrichContentPartsWithImages({content: entry.message.content, contentParts: this.pendingContentParts}),
      id: entry.id,
      timestamp: entry.timestamp,
    });
    this.pendingContentParts = [];
    for (const compaction of this.pendingCompactionEntries) this.currentTurn.addCompactionEntry(compaction);
    this.pendingCompactionEntries = [];
  }

  private completeCurrentTurn(): void {
    if (!this.currentTurn) return;
    this.turns.push(this.currentTurn.toTurn(this.fallbackModel));
    this.currentTurn = undefined;
  }
}

/** Builds normalized turns from timeline entries in transcript order. */
export function buildTurns(entries: readonly TimelineEntry[], fallbackModel: ModelReference): Turn[] {
  const builder = new TurnBuilder(fallbackModel);
  for (const entry of entries) builder.addEntry(entry);
  return builder.toTurns();
}
