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
  const lastAssistantEventId = turn.events.findLast((event) => event.type === "assistant" && event.content.trim().length > 0)?.id;

  let workEvents: SessionWorkEvent[] = [];
  let workIndex = 0;

  const flushWork = (workLive: boolean, completedAt?: string): void => {
    if (workEvents.length === 0) return;

    items.push({
      durationMs: workDuration(workEvents, completedAt),
      events: workEvents,
      id: `work:${turn.id}:${workIndex}`,
      live: workLive,
      spacing: "work",
      turnId: turn.id,
      type: "work",
    });

    workIndex += 1;
    workEvents = [];
  };

  items.push({id: `user:${turn.userMessage.id}`, message: turn.userMessage, spacing: "message", turnId: turn.id, type: "user"});

  for (const [eventIndex, event] of turn.events.entries()) {
    if (event.type === "tool") {
      workEvents.push(event);
      continue;
    }

    if (event.type === "reasoning") {
      flushWork(false, event.timestamp);
      items.push({event, id: `reasoning:${event.id}`, live, spacing: "work", turnId: turn.id, type: "reasoning"});
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
    // Only the turn's final response gets message spacing and actions; an
    // error-only event is a note inside the turn's work, not its reply.
    const final = event.id === lastAssistantEventId;
    items.push({event, final, id: `assistant:${event.id}`, live, spacing: final ? "message" : "work", turnId: turn.id, type: "assistant"});
  }

  flushWork(turn.status === "streaming" && live, turn.completedAt);

  // Settled turns show only the final response; everything before it folds
  // behind one "Worked for" row. The live turn stays fully expanded.
  const finalIndex = live ? -1 : items.findIndex((item) => item.type === "assistant" && item.final);
  if (finalIndex > 1) {
    const folded = items.slice(1, finalIndex);
    const startedAt = turn.startedAt ?? turn.userMessage.timestamp ?? turn.events[0]?.timestamp;
    const completedAt = items[finalIndex]?.type === "assistant" ? items[finalIndex].event.timestamp : turn.completedAt;
    const durationMs = startedAt === undefined || completedAt === undefined ? undefined : Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
    return [items[0]!, {durationMs, id: `turn-work:${turn.id}`, items: folded, spacing: "work", turnId: turn.id, type: "turn-work"}, ...items.slice(finalIndex)];
  }

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
