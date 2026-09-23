import type {CompactionTurnEvent, TurnEvent, UserMessage} from "@supernova/contracts/sessions/schemas";

export type SessionAssistantEvent = Extract<TurnEvent, {type: "assistant"}>;
export type SessionReasoningEvent = Extract<TurnEvent, {type: "reasoning"}>;
export type SessionWorkEvent = Extract<TurnEvent, {type: "tool"}>;
export type SessionCompactionEvent = CompactionTurnEvent;

interface SessionTimelineItemBase {
  readonly id: string;
  readonly spacing: "message" | "work";
  readonly turnId: string;
}

export interface AssistantSessionTimelineItem extends SessionTimelineItemBase {
  readonly event: SessionAssistantEvent;
  /** Only the turn's final response carries copy/timestamp actions. */
  readonly final: boolean;
  readonly live: boolean;
  readonly spacing: "message" | "work";
  readonly type: "assistant";
}

export interface ReasoningSessionTimelineItem extends SessionTimelineItemBase {
  readonly event: SessionReasoningEvent;
  readonly live: boolean;
  readonly spacing: "work";
  readonly type: "reasoning";
}

export interface UserSessionTimelineItem extends SessionTimelineItemBase {
  readonly message: UserMessage;
  readonly spacing: "message";
  readonly type: "user";
}

export interface WorkSessionTimelineItem extends SessionTimelineItemBase {
  readonly durationMs: number | undefined;
  readonly events: readonly SessionWorkEvent[];
  readonly live: boolean;
  readonly spacing: "message" | "work";
  readonly type: "work";
}

export interface CompactionSessionTimelineItem extends SessionTimelineItemBase {
  readonly durationMs: number | undefined;
  readonly event: SessionCompactionEvent;
  readonly spacing: "work";
  readonly type: "compaction";
}

/** A settled turn's activity before its final response, folded behind "Worked for". */
export interface TurnWorkSessionTimelineItem extends SessionTimelineItemBase {
  readonly durationMs: number | undefined;
  readonly items: readonly SessionTimelineItem[];
  readonly spacing: "work";
  readonly type: "turn-work";
}

export type SessionTimelineItem =
  | AssistantSessionTimelineItem
  | CompactionSessionTimelineItem
  | ReasoningSessionTimelineItem
  | TurnWorkSessionTimelineItem
  | UserSessionTimelineItem
  | WorkSessionTimelineItem;

export interface SessionTimelineItems {
  readonly committedItems: readonly SessionTimelineItem[];
  readonly liveItems: readonly SessionTimelineItem[];
}
