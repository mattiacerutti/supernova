import type {Turn} from "@supernova/contracts/sessions/schemas";
import {workDuration} from "@/features/sessions/lib/timeline/work-timeline-items";
import type {SessionTimelineItem, SessionTimelineItems, SessionWorkEvent} from "@/features/sessions/types/session-timeline-item";

interface BuildSessionTimelineInput {
  readonly live: boolean;
  readonly liveTurn: Turn | null;
  readonly turns: readonly Turn[];
}

function turnToTimelineItems(turn: Turn, live: boolean): SessionTimelineItem[] {
  const items: SessionTimelineItem[] = [];
  const hasAssistantResponse = turn.events.some((event) => event.type === "assistant" && event.content.trim().length > 0);

  let workEvents: SessionWorkEvent[] = [];
  let workIndex = 0;

  const flushWork = (workLive: boolean, completedAt?: string): void => {
    if (workEvents.length === 0) return;

    items.push({
      collapsible: hasAssistantResponse,
      durationMs: workDuration(workEvents, completedAt),
      events: workEvents,
      id: `work:${turn.id}:${workIndex}`,
      live: workLive,
      spacing: hasAssistantResponse ? "work" : "message",
      turnId: turn.id,
      type: "work",
    });

    workIndex += 1;
    workEvents = [];
  };

  items.push({id: `user:${turn.userMessage.id}`, message: turn.userMessage, spacing: "message", turnId: turn.id, type: "user"});

  for (const [eventIndex, event] of turn.events.entries()) {
    if (event.type === "tool" || event.type === "reasoning") {
      workEvents.push(event);
      continue;
    }

    if (event.type === "compaction") {
      flushWork(false, event.timestamp);
      if (event.status !== "completed") continue;

      const nextEvent = turn.events[eventIndex + 1];
      items.push({
        durationMs: workDuration([event], nextEvent?.timestamp ?? turn.completedAt),
        event,
        id: `compaction:${event.id}`,
        spacing: "work",
        turnId: turn.id,
        type: "compaction",
      });
      continue;
    }

    flushWork(false, event.timestamp);
    items.push({event, id: `assistant:${event.id}`, live, spacing: "message", turnId: turn.id, type: "assistant"});
  }

  flushWork(turn.status === "streaming" && live, turn.completedAt);

  return items;
}

/** Builds committed and live timeline item groups from raw session turns. */
export function buildSessionTimeline(input: BuildSessionTimelineInput): SessionTimelineItems {
  const {live, liveTurn, turns} = input;

  return {
    committedItems: buildCommittedTimelineItems(turns),
    liveItems: buildLiveTimelineItems({live, liveTurn}),
  };
}

/** Builds timeline items for persisted turns. Callers can cache this by committed turn array identity. */
export function buildCommittedTimelineItems(turns: readonly Turn[]): readonly SessionTimelineItem[] {
  return turns.flatMap((turn) => turnToTimelineItems(turn, false));
}

/** Builds timeline items for the active turn only. */
export function buildLiveTimelineItems(input: {readonly live: boolean; readonly liveTurn: Turn | null}): readonly SessionTimelineItem[] {
  const {live, liveTurn} = input;
  return liveTurn ? turnToTimelineItems(liveTurn, live) : [];
}
