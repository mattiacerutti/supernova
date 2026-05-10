import type {IAgentModelReference, IAgentSessionTurn, IAgentSessionTurnEvent, IAgentSessionUserMessage} from "@pi-desktop/contracts/sessions";

export function sessionTurnStatus(events: readonly IAgentSessionTurnEvent[], streaming = false): IAgentSessionTurn["status"] {
  if (events.some((event) => (event.type === "assistant" && Boolean(event.error)) || (event.type === "tool" && event.tool?.status === "error"))) return "error";
  return streaming ? "streaming" : "completed";
}

export function sessionTurn(input: {events: IAgentSessionTurnEvent[]; model: IAgentModelReference; streaming?: boolean; userMessage: IAgentSessionUserMessage}): IAgentSessionTurn {
  const {events, model, streaming, userMessage} = input;
  return {
    completedAt: events.at(-1)?.timestamp,
    events,
    id: `turn-${userMessage.id}`,
    model,
    startedAt: userMessage.timestamp,
    status: sessionTurnStatus(events, streaming),
    userMessage,
  };
}

export function markLastTurnStreaming(turns: readonly IAgentSessionTurn[]): IAgentSessionTurn[] {
  const lastTurn = turns.at(-1);
  if (!lastTurn || lastTurn.status !== "completed") return [...turns];
  return [...turns.slice(0, -1), {...lastTurn, status: "streaming"}];
}
