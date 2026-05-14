import type {ModelReference, SessionTurn, SessionTurnEvent, SessionUserMessage} from "@pi-desktop/contracts/sessions/schemas";

export function sessionTurnStatus(events: readonly SessionTurnEvent[], streaming = false): SessionTurn["status"] {
  if (events.some((event) => (event.type === "assistant" && Boolean(event.error)) || (event.type === "tool" && event.tool?.status === "error"))) return "error";
  return streaming ? "streaming" : "completed";
}

export function sessionTurn(input: {events: SessionTurnEvent[]; model: ModelReference; streaming?: boolean; userMessage: SessionUserMessage}): SessionTurn {
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
