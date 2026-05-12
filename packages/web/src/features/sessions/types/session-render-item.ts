import type {AgentSessionTurnEvent, AgentSessionUserMessage} from "@pi-desktop/contracts/sessions/schemas";

export type SessionAssistantEvent = Extract<AgentSessionTurnEvent, {type: "assistant"}>;
export type SessionWorkEvent = Extract<AgentSessionTurnEvent, {type: "reasoning" | "tool"}>;

export type AssistantSessionRenderItem = {type: "assistant"; event: SessionAssistantEvent; live: boolean};
export type UserSessionRenderItem = {type: "user"; message: AgentSessionUserMessage};
export type WorkSessionRenderItem = {type: "work"; collapsible: boolean; events: SessionWorkEvent[]; durationMs: number | undefined; id: string; live: boolean};

export type SessionRenderItem = AssistantSessionRenderItem | UserSessionRenderItem | WorkSessionRenderItem;
