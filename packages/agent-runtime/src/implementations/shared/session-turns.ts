import type {AgentModelReference, AgentSessionTurn, AgentSessionTurnEvent, AgentSessionUserMessage} from "@pi-desktop/contracts/sessions/schemas";

export function sessionTurnStatus(events: readonly AgentSessionTurnEvent[], streaming = false): AgentSessionTurn["status"] {
  if (events.some((event) => (event.type === "assistant" && Boolean(event.error)) || (event.type === "tool" && event.tool?.status === "error"))) return "error";
  return streaming ? "streaming" : "completed";
}

export function sessionTurn(input: {events: AgentSessionTurnEvent[]; model: AgentModelReference; streaming?: boolean; userMessage: AgentSessionUserMessage}): AgentSessionTurn {
  const {events, model, streaming, userMessage} = input;
  return {
    completedAt: events.at(-1)?.timestamp,
    events,
    id: userMessage.id,
    model,
    startedAt: userMessage.timestamp,
    status: sessionTurnStatus(events, streaming),
    userMessage,
  };
}
