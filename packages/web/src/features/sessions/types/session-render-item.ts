import type {IAgentSessionTurnEvent, IAgentSessionUserMessage} from "@pi-desktop/contracts/sessions";

export type SessionRenderItem =
  | {type: "assistant"; event: Extract<IAgentSessionTurnEvent, {type: "assistant"}>; live: boolean}
  | {type: "user"; message: IAgentSessionUserMessage}
  | {type: "work"; durationMs: number | undefined; events: IAgentSessionTurnEvent[]; id: string; live: boolean};
