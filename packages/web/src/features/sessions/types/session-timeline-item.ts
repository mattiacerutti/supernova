import type {SessionTurnEvent, SessionUserMessage} from "@supernova/contracts/sessions/schemas";

export type SessionAssistantEvent = Extract<SessionTurnEvent, {type: "assistant"}>;
export type SessionWorkEvent = Extract<SessionTurnEvent, {type: "reasoning" | "tool"}>;

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
  readonly message: SessionUserMessage;
  readonly spacing: "message";
  readonly type: "user";
}

export interface WorkSessionTimelineItem extends SessionTimelineItemBase {
  readonly collapsible: boolean;
  readonly durationMs: number | undefined;
  readonly events: readonly SessionWorkEvent[];
  readonly live: boolean;
  readonly spacing: "work";
  readonly type: "work";
}

export type SessionTimelineItem = AssistantSessionTimelineItem | UserSessionTimelineItem | WorkSessionTimelineItem;

export interface SessionTimelineItems {
  readonly committedItems: readonly SessionTimelineItem[];
  readonly liveItems: readonly SessionTimelineItem[];
}
