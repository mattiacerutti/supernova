import type {AgentSession} from "@mariozechner/pi-coding-agent";
import type {
  IAgentModelReference,
  IAgentSessionTool,
  IAgentSessionToolTurnEvent,
  IAgentSessionTurn,
  IAgentSessionTurnEvent,
  IAgentSessionUserMessage,
} from "@pi-desktop/contracts/sessions";
import {sessionTurn} from "@pi-desktop/agent-runtime/implementations/shared/session-turns";

type PiAgentMessage = AgentSession["messages"][number];

function partsToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part !== "object" || part === null) return "";
      if ("type" in part) {
        if (part.type === "text" && "text" in part && typeof part.text === "string") return part.text;
        if (part.type === "image") return "[Image]";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function toolSummary(toolName: string): string {
  switch (toolName) {
    case "bash":
      return "Ran command";
    case "ls":
      return "Listed files";
    case "read":
      return "Read file";
    case "edit":
    case "write":
      return "Edited file";
    case "find":
    case "grep":
      return "Explored files";
    default:
      return `Ran ${toolName}`;
  }
}

export function normalizePiSessionTurns(messages: readonly PiAgentMessage[], fallbackModel: IAgentModelReference): IAgentSessionTurn[] {
  const turns: IAgentSessionTurn[] = [];
  let currentUser: IAgentSessionUserMessage | undefined;
  let currentEvents: IAgentSessionTurnEvent[] = [];
  const toolEventIndexes = new Map<string, number>();

  const flush = (): void => {
    if (!currentUser) return;
    turns.push(sessionTurn({events: currentEvents, model: fallbackModel, userMessage: currentUser}));
    currentEvents = [];
    toolEventIndexes.clear();
  };

  const ensureUser = (id: string, timestamp: string): void => {
    currentUser ??= {content: "", id: `implicit-user-${id}`, timestamp};
  };

  for (const [index, message] of messages.entries()) {
    if (!("role" in message)) continue;

    const timestamp = new Date(message.timestamp).toISOString();
    const id = `${timestamp}-${message.role}-${index}`;

    switch (message.role) {
      case "user": {
        const content = partsToText(message.content);
        if (content.length === 0) break;
        flush();
        currentUser = {content, id, timestamp};
        break;
      }
      case "assistant": {
        // Pi records user-initiated stops as aborted assistant errors.
        // The UI renders the preserved partial turn instead of showing that as a failure.
        const error = message.stopReason === "aborted" ? undefined : message.errorMessage;
        if (message.content.length === 0 && !error) break;
        ensureUser(id, timestamp);

        // TODO: Pi persists one timestamp for the whole assistant message, not per content part.
        // We still split thinking/text/toolCall parts into separate contract events to preserve
        // their display order, but those events necessarily share this message timestamp.
        // As a result, work duration between a reasoning part and the following text part can
        // collapse to 0ms. This should be fixed on Pi side by allowing per-part timestamps.
        for (const [partIndex, part] of message.content.entries()) {
          switch (part.type) {
            case "thinking": {
              if (part.thinking.length > 0) {
                currentEvents.push({
                  id: `${id}-reasoning-${partIndex}`,
                  type: "reasoning",
                  content: part.thinking,
                  timestamp,
                });
              }
              break;
            }
            case "text": {
              if (part.text.length > 0) {
                currentEvents.push({
                  id: `${id}-text-${partIndex}`,
                  type: "assistant",
                  content: part.text,
                  timestamp,
                });
              }
              break;
            }
            case "toolCall": {
              const toolName = part.name;
              toolEventIndexes.set(part.id, currentEvents.length);
              currentEvents.push({
                id: `${id}-tool-${partIndex}-${part.id}`,
                timestamp,
                tool: {
                  input: part.arguments,
                  name: toolName,
                  status: "pending",
                  summary: toolSummary(toolName),
                },
                type: "tool",
              });
              break;
            }
          }
        }

        if (error) {
          currentEvents.push({content: "", error, id: `${id}-error`, timestamp, type: "assistant"});
        }
        break;
      }
      case "toolResult": {
        const output = partsToText(message.content);

        const completedTool: IAgentSessionTool = {
          name: message.toolName,
          status: message.isError ? "error" : "completed",
          output: message.isError ? undefined : output,
          summary: toolSummary(message.toolName),
          error: message.isError ? output : undefined,
        };

        ensureUser(id, timestamp);
        const toolEvent: IAgentSessionToolTurnEvent = {
          id,
          timestamp,
          tool: completedTool,
          type: "tool",
        };

        const existingToolIndex = toolEventIndexes.get(message.toolCallId);

        if (existingToolIndex === undefined) {
          currentEvents.push(toolEvent);
          break;
        }

        const existingToolEvent = currentEvents[existingToolIndex];
        if (!existingToolEvent || existingToolEvent.type !== "tool") {
          currentEvents.push(toolEvent);
          break;
        }

        currentEvents[existingToolIndex] = {
          ...toolEvent,
          durationMs: new Date(timestamp).getTime() - new Date(existingToolEvent.timestamp).getTime(),
          id: existingToolEvent.id,
          timestamp: existingToolEvent.timestamp,
          tool: {...completedTool, input: existingToolEvent.tool?.input},
        };
        break;
      }
    }
  }

  flush();
  return turns;
}
