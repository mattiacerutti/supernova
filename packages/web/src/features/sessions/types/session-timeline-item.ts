import type {SessionAssistantEvent, SessionCompactionEvent, SessionReasoningEvent, SessionUserMessage, SessionWorkEvent} from "@/features/sessions/types/session-turn";

export type {SessionAssistantEvent, SessionCompactionEvent, SessionReasoningEvent, SessionWorkEvent} from "@/features/sessions/types/session-turn";

interface SessionTimelineItemBase {
  /** The turn's last item once settled; it carries the timestamp actions. */
  readonly final: boolean;
  readonly id: string;
  readonly spacing: "message" | "work";
  readonly turnId: string;
}

export interface AssistantSessionTimelineItem extends SessionTimelineItemBase {
  readonly event: SessionAssistantEvent;
  readonly live: boolean;
  readonly type: "assistant";
}

export interface ReasoningSessionTimelineItem extends SessionTimelineItemBase {
  readonly event: SessionReasoningEvent;
  readonly live: boolean;
  readonly type: "reasoning";
}

export interface UserSessionTimelineItem extends SessionTimelineItemBase {
  readonly message: SessionUserMessage;
  readonly spacing: "message";
  readonly type: "user";
}

export interface WorkSessionTimelineItem extends SessionTimelineItemBase {
  readonly durationMs: number | undefined;
  readonly events: readonly SessionWorkEvent[];
  readonly live: boolean;
  readonly type: "work";
}

export interface CompactionSessionTimelineItem extends SessionTimelineItemBase {
  readonly durationMs: number | undefined;
  readonly event: SessionCompactionEvent;
  readonly type: "compaction";
}

/** A settled turn's activity before its final response, folded behind "Worked for". */
export interface TurnWorkSessionTimelineItem extends SessionTimelineItemBase {
  readonly durationMs: number | undefined;
  readonly items: readonly SessionTimelineItem[];
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
