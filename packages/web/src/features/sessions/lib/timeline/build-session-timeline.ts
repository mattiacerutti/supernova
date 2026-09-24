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

  let workEvents: SessionWorkEvent[] = [];
  let workIndex = 0;

  const flushWork = (workLive: boolean, completedAt?: string): void => {
    if (workEvents.length === 0) return;

    items.push({
      durationMs: workDuration(workEvents, completedAt),
      events: workEvents,
      final: false,
      id: `work:${turn.id}:${workIndex}`,
      live: workLive,
      spacing: "work",
      turnId: turn.id,
      type: "work",
    });

    workIndex += 1;
    workEvents = [];
  };

  items.push({final: false, id: `user:${turn.userMessage.id}`, message: turn.userMessage, spacing: "message", turnId: turn.id, type: "user"});

  for (const [eventIndex, event] of turn.events.entries()) {
    if (event.type === "tool") {
      workEvents.push(event);
      continue;
    }

    if (event.type === "reasoning") {
      flushWork(false, event.timestamp);
      items.push({event, final: false, id: `reasoning:${event.id}`, live, spacing: "work", turnId: turn.id, type: "reasoning"});
      continue;
    }

    if (event.type === "compaction") {
      flushWork(false, event.timestamp);
      if (event.status !== "completed") continue;

      const nextEvent = turn.events[eventIndex + 1];
      items.push({
        durationMs: workDuration([event], nextEvent?.timestamp ?? turn.completedAt),
        event,
        final: false,
        id: `compaction:${event.id}`,
        spacing: "work",
        turnId: turn.id,
        type: "compaction",
      });
      continue;
    }

    flushWork(false, event.timestamp);
    items.push({event, final: false, id: `assistant:${event.id}`, live, spacing: "work", turnId: turn.id, type: "assistant"});
  }

  flushWork(turn.status === "streaming" && live, turn.completedAt);

  // Once settled, a turn ending on a response folds everything before it behind
  // one "Worked for" row; a turn ending on work stays flat. Compaction is a
  // marker and never concludes a turn.
  const last = items.at(-1);
  if (!last || last.type === "user" || last.type === "compaction") return items;
  const response = last.type === "assistant" && last.event.content.trim().length > 0;
  items[items.length - 1] = {...last, final: !live, spacing: response ? "message" : "work"};
  if (live || !response || items.length <= 2) return items;

  const startedAt = turn.startedAt ?? turn.userMessage.timestamp ?? turn.events[0]?.timestamp;
  const durationMs = startedAt === undefined ? undefined : Math.max(0, Date.parse(last.event.timestamp) - Date.parse(startedAt));
  return [
    items[0]!,
    {durationMs, final: false, id: `turn-work:${turn.id}`, items: items.slice(1, -1), spacing: "work", turnId: turn.id, type: "turn-work"},
    items[items.length - 1]!,
  ];
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
