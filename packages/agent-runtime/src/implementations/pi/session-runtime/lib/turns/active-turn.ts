import type {AgentSession, CompactionResult} from "@earendil-works/pi-coding-agent";
import type {ModelReference, Session, Turn} from "@supernova/contracts/sessions/schemas";
import {toPiSessionSummary} from "@supernova/agent-runtime/implementations/pi/projects/pi-session-mapper";
import type {PiSessionInfo, PiSessionManager} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-session-store";
import {buildPiTurns} from "@supernova/agent-runtime/implementations/pi/shared/lib/turns-builder";
import {createLiveBranchEntries} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/turns/live-branch-entries";
import type {SendMessageContext} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/user-message/send-message-context";

type PiAgentMessage = AgentSession["messages"][number];

export interface ActiveTurnInput {
  readonly sessionInfo: PiSessionInfo;
  readonly baseParentId: string | null;
  readonly messageContext: SendMessageContext;
  readonly modelReference: ModelReference;
}

/** Command-scoped runtime state for one accepted user turn while Pi may still emit live events. */
export class ActiveTurn {
  private readonly sessionManager: PiSessionManager;

  private readonly sessionInfo: PiSessionInfo;
  private readonly baseParentId: string | null;
  private readonly messageContext: SendMessageContext;
  private readonly modelReference: ModelReference;
  /** Runtime-owned live transcript for this turn. */
  private readonly liveMessages: PiAgentMessage[] = [];

  public constructor(input: ActiveTurnInput, sessionManager: PiSessionManager) {
    this.baseParentId = input.baseParentId;
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
  public appendCustomEntries(): void {
    for (const entry of this.messageContext.customEntries) this.sessionManager.appendCustomEntry(entry.customType, entry.data);
  }

  /** Appends a live Pi message according to Pi's ordered message lifecycle. */
  public appendLiveMessage(message: PiAgentMessage): void {
    this.liveMessages.push(message);
  }

  /** Replaces the currently active live Pi message. */
  public replaceLastLiveMessage(message: PiAgentMessage): void {
    if (this.liveMessages.length === 0) {
      this.liveMessages.push(message);
      return;
    }

    this.liveMessages[this.liveMessages.length - 1] = message;
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
    const turns = buildPiTurns(this.sessionManager.getBranch(), this.modelReference);
    const summary = toPiSessionSummary(this.sessionInfo);
    const latestTurn = turns.at(-1);

    return {
      session: {
        id: this.sessionInfo.id,
        model: this.modelReference,
        projectPath: this.sessionInfo.cwd,
        title: this.sessionManager.getSessionName() ?? summary.title,
        turns,
        updatedAt: latestTurn?.completedAt ?? latestTurn?.startedAt ?? summary.updatedAt,
      },
    };
  }
}
