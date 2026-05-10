import type {IAgentSessionToolTurnEvent, IAgentSessionTurn} from "@pi-desktop/contracts/sessions";
import type {SessionRenderItem} from "@/features/sessions/types/session-render-item";
import type {SessionWorkEvent} from "@/features/sessions/types/session-render-item";

function workDuration(events: SessionWorkEvent[], completedAt: string | undefined): number | undefined {
  const times = events.map((event) => new Date(event.timestamp).getTime());
  const startedAt = times.at(0);
  const completedAtMs = completedAt === undefined ? times.at(-1) : new Date(completedAt).getTime();

  if (startedAt === undefined || completedAtMs === undefined || completedAtMs < startedAt) return undefined;
  return completedAtMs - startedAt;
}

/**
 * Converts a single turn into a list of render items. A turn can contain multiple assistant events interleaved with tool / reasoning events, and we want to group consecutive tool/ reasoning events into "work" items. For streaming turns, the last "work" item is considered live and may have an open-ended duration.
 */
function turnToRenderItems(turn: IAgentSessionTurn, isStreaming: boolean): SessionRenderItem[] {
  const items: SessionRenderItem[] = [];

  let workEvents: SessionWorkEvent[] = [];
  let workIndex = 0;

  const flushWork = (live: boolean, completedAt?: string): void => {
    if (workEvents.length === 0) return;
    items.push({
      id: `work-${workIndex}`,
      type: "work",
      events: workEvents,
      durationMs: workDuration(workEvents, completedAt),
      live,
    });
    workIndex += 1;
    workEvents = [];
  };

  items.push({message: turn.userMessage, type: "user"});

  for (const event of turn.events) {
    const isWork = event.type === "tool" || event.type === "reasoning";

    if (isWork) {
      workEvents.push(event);
      continue;
    }

    flushWork(false, event.timestamp);
    items.push({event, live: isStreaming, type: "assistant"});
  }

  flushWork(turn.status === "streaming" && isStreaming, turn.completedAt);

  return items;
}

export function turnsToRenderItems(turns: readonly IAgentSessionTurn[], isStreaming: boolean): SessionRenderItem[] {
  return turns.flatMap((turn) => turnToRenderItems(turn, isStreaming));
}

export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined || durationMs < 1000) return "a moment";
  return `${Math.max(1, Math.round(durationMs / 1000))}s`;
}

export function getWorkIconName(event: IAgentSessionToolTurnEvent): "folder" | "server" {
  return event.tool?.name === "bash" ? "server" : "folder";
}
