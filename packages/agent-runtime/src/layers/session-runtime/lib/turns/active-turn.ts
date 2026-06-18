import type {AgentSession, CompactionResult} from "@earendil-works/pi-coding-agent";
import type {ModelReference, Session, Turn} from "@supernova/contracts/sessions/schemas";
import {toPiSessionSummary} from "@supernova/agent-runtime/layers/projects/pi-session-mapper";
import type {PiSessionInfo, PiSessionManager} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";
import {buildPiTurns} from "@supernova/agent-runtime/layers/shared/lib/turns-builder";
import {buildSessionContextUsage} from "@supernova/agent-runtime/layers/session-runtime/lib/session-context-usage";
import {createLiveBranchEntries} from "@supernova/agent-runtime/layers/session-runtime/lib/turns/live-branch-entries";
import type {SendMessageContext} from "@supernova/agent-runtime/layers/session-runtime/lib/user-message/send-message-context";

type PiAgentMessage = AgentSession["messages"][number];

function stripToolArguments(message: PiAgentMessage): PiAgentMessage {
  if (message.role !== "assistant") return message;

  return {
    ...message,
    content: message.content.map((part) => (part.type === "toolCall" ? {...part, arguments: {}} : part)),
  };
}

export interface ActiveTurnInput {
  readonly sessionInfo: PiSessionInfo;
  readonly baseParentId: string | null;
  readonly contextWindow: number;
  readonly customEntries?: readonly {readonly customType: string; readonly data: unknown}[];
  readonly messageContext: SendMessageContext;
  readonly modelReference: ModelReference;
}

/** Command-scoped runtime state for one accepted user turn while Pi may still emit live events. */
export class ActiveTurn {
  private readonly sessionManager: PiSessionManager;

  private readonly sessionInfo: PiSessionInfo;
  private readonly baseParentId: string | null;
  private readonly contextWindow: number;
  private readonly customEntries: readonly {readonly customType: string; readonly data: unknown}[];
  private readonly messageContext: SendMessageContext;
  private readonly modelReference: ModelReference;
  /** Runtime-owned live transcript for this turn. */
  private readonly liveMessages: PiAgentMessage[] = [];

  public constructor(input: ActiveTurnInput, sessionManager: PiSessionManager) {
    this.baseParentId = input.baseParentId;
    this.contextWindow = input.contextWindow;
    this.customEntries = input.customEntries ?? [];
    this.messageContext = input.messageContext;
    this.modelReference = input.modelReference;
    this.sessionInfo = input.sessionInfo;
    this.sessionManager = sessionManager;
  }

  /** Prepared prompt text passed to Pi for this turn. */
  public get prompt(): string {
    return this.messageContext.prompt;
  }

  /** Prepared prompt images passed to Pi for this turn. */
  public get images(): SendMessageContext["images"] {
    return this.messageContext.images;
  }

  /** Appends Supernova-authored metadata entries that must precede the submitted user message. */
  public appendCustomEntries(): string[] {
    const appendedEntryIds: string[] = [];
    for (const entry of this.customEntries) appendedEntryIds.push(this.sessionManager.appendCustomEntry(entry.customType, entry.data));
    for (const entry of this.messageContext.customEntries) appendedEntryIds.push(this.sessionManager.appendCustomEntry(entry.customType, entry.data));
    return appendedEntryIds;
  }

  /** Appends a live Pi message according to Pi's ordered message lifecycle. */
  public appendLiveMessage(message: PiAgentMessage): void {
    // The `message_update` event emits partial tool call arguments, since they are being streamed in realtime.
    // To avoid showing incomplete arguments in the live transcript, we strip them out until the full arguments are available in the `tool_execution_start` event.
    const sanitzedMessage = stripToolArguments(message);
    this.liveMessages.push(sanitzedMessage);
  }

  /** Replaces the currently active live Pi message. */
  public replaceLastLiveMessage(message: PiAgentMessage): void {
    const sanitizedMessage = stripToolArguments(message);

    if (this.liveMessages.length === 0) {
      this.liveMessages.push(sanitizedMessage);
      return;
    }

    this.liveMessages[this.liveMessages.length - 1] = sanitizedMessage;
  }

  /** Records non-streaming tool arguments once Pi starts executing a tool call. */
  public recordToolExecutionStart(input: {readonly args: unknown; readonly toolCallId: string}): void {
    // Pi emits `tool_execution_start` event before argument validation, thus they are typed as unknown.
    // In case they are malformed, we simply reject recording them, as after validation a `tool_execution_end` event with error will still be emitted
    const isValidToolArgs = (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null && !Array.isArray(value);
    };

    if (!isValidToolArgs(input.args)) return;
    const args = input.args;

    // Finds the message added by `message_update` event with the same toolCallId
    const match = this.liveMessages.reduceRight<readonly [number, number] | undefined>((matched, message, messageIndex) => {
      if (matched) return matched;
      if (message.role !== "assistant") return undefined;

      const toolCallIndex = message.content.findIndex((part) => part.type === "toolCall" && part.id === input.toolCallId);
      return toolCallIndex === -1 ? undefined : [messageIndex, toolCallIndex];
    }, undefined);
    if (!match) return;

    const [messageIndex, toolCallIndex] = match;
    const message = this.liveMessages[messageIndex];
    if (message?.role !== "assistant") return;

    const toolCall = message.content[toolCallIndex];
    if (toolCall?.type !== "toolCall") return;

    // Replaces the tool call arguments with the execution-start arguments
    const content = [...message.content];
    content[toolCallIndex] = {...toolCall, arguments: args};

    this.liveMessages[messageIndex] = {...message, content};
  }

  /** Adds a pending live compaction marker using Pi's context-summary message shape. */
  public appendLiveCompaction(): void {
    this.appendLiveMessage({role: "compactionSummary", summary: "", timestamp: Date.now(), tokensBefore: 0} satisfies PiAgentMessage);
  }

  /** Completes or removes the pending live compaction marker. */
  public completeLiveCompaction(result: CompactionResult | undefined): void {
    if (!result) {
      if (this.liveMessages.at(-1)?.role === "compactionSummary") this.liveMessages.pop();
      return;
    }

    const current = this.liveMessages.at(-1);
    const message = {
      role: "compactionSummary",
      summary: result.summary,
      timestamp: current?.role === "compactionSummary" ? current.timestamp : Date.now(),
      tokensBefore: result.tokensBefore,
    } satisfies PiAgentMessage;

    if (current?.role !== "compactionSummary") this.appendLiveMessage(message);
    else this.replaceLastLiveMessage(message);
  }

  /** Builds only the active turn projection; committed turns are unchanged while streaming. */
  public buildLiveTurn(): Turn | undefined {
    const liveEntries = createLiveBranchEntries({
      contentParts: this.messageContext.contentParts,
      messages: this.liveMessages,
      parentId: this.baseParentId,
      sessionId: this.sessionInfo.id,
    });
    const [turn] = buildPiTurns(liveEntries, this.modelReference);
    return turn ? ({...turn, status: "streaming"} satisfies Turn) : undefined;
  }

  /** Builds the authoritative committed snapshot after Pi has persisted and drained the turn. */
  public buildSettledSnapshot(): {session: Session} {
    const branch = this.sessionManager.getBranch();
    const turns = buildPiTurns(branch, this.modelReference);
    const summary = toPiSessionSummary(this.sessionInfo);
    const latestTurn = turns.at(-1);

    return {
      session: {
        id: this.sessionInfo.id,
        model: this.modelReference,
        context: buildSessionContextUsage({contextWindow: this.contextWindow, entries: branch, messages: this.sessionManager.buildSessionContext().messages}),
        projectPath: this.sessionInfo.cwd,
        title: this.sessionManager.getSessionName() ?? summary.title,
        turns,
        undoneTurns: [],
        updatedAt: latestTurn?.completedAt ?? latestTurn?.startedAt ?? summary.updatedAt,
      },
    };
  }
}
