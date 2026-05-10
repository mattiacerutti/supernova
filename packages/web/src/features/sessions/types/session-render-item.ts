import type {IAgentSessionTurnEvent, IAgentSessionUserMessage} from "@pi-desktop/contracts/sessions";

export type SessionAssistantEvent = Extract<IAgentSessionTurnEvent, {type: "assistant"}>;
export type SessionWorkEvent = Extract<IAgentSessionTurnEvent, {type: "reasoning" | "tool"}>;

export type AssistantSessionRenderItem = {type: "assistant"; event: SessionAssistantEvent; live: boolean};
export type UserSessionRenderItem = {type: "user"; message: IAgentSessionUserMessage};
export type WorkSessionRenderItem = {type: "work"; events: SessionWorkEvent[]; durationMs: number | undefined; id: string; live: boolean};

export type SessionRenderItem = AssistantSessionRenderItem | UserSessionRenderItem | WorkSessionRenderItem;
