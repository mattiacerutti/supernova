import type {ModelReference, Turn, TurnEvent, UserMessage} from "@supernova/contracts/sessions/schemas";

/** Computes the aggregate status for a turn from its events. */
export function turnStatus(events: readonly TurnEvent[], streaming = false): Turn["status"] {
  if (
    events.some(
      (event) =>
        (event.type === "assistant" && Boolean(event.error)) ||
        (event.type === "tool" && event.tool?.status === "error") ||
        (event.type === "compaction" && event.status === "error")
    )
  )
    return "error";
  return streaming ? "streaming" : "completed";
}

/** Creates a normalized turn from a user message and collected events. */
export function createTurn(input: {events: TurnEvent[]; model: ModelReference; streaming?: boolean; userMessage: UserMessage}): Turn {
  const {events, model, streaming, userMessage} = input;
  return {
    completedAt: events.at(-1)?.timestamp,
    events,
    id: userMessage.id,
    model,
    startedAt: userMessage.timestamp,
    status: turnStatus(events, streaming),
    userMessage,
  };
}
