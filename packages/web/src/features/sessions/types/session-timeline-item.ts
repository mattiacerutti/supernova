import type {CompactionTurnEvent, TurnEvent, UserMessage} from "@supernova/contracts/sessions/schemas";

export type SessionAssistantEvent = Extract<TurnEvent, {type: "assistant"}>;
export type SessionWorkEvent = Extract<TurnEvent, {type: "reasoning" | "tool"}>;
export type SessionCompactionEvent = CompactionTurnEvent;

interface SessionTimelineItemBase {
  readonly id: string;
  readonly spacing: "message" | "work";
  readonly turnId: string;
}

export interface AssistantSessionTimelineItem extends SessionTimelineItemBase {
  readonly event: SessionAssistantEvent;
  readonly live: boolean;
  readonly spacing: "message";
  readonly type: "assistant";
}

export interface UserSessionTimelineItem extends SessionTimelineItemBase {
  readonly message: UserMessage;
  readonly spacing: "message";
  readonly type: "user";
}

export interface WorkSessionTimelineItem extends SessionTimelineItemBase {
  readonly collapsible: boolean;
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

export type SessionTimelineItem = AssistantSessionTimelineItem | CompactionSessionTimelineItem | UserSessionTimelineItem | WorkSessionTimelineItem;

export interface SessionTimelineItems {
  readonly committedItems: readonly SessionTimelineItem[];
  readonly liveItems: readonly SessionTimelineItem[];
}
