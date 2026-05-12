import type {AgentSessionTurn} from "@pi-desktop/contracts/sessions/schemas";

const STREAM_BACKLOG_CATCHUP_RATE = 8;
export const STREAM_FRAME_MAX_DELTA_MS = 34;
const STREAM_MAX_CHARS_PER_SECOND = 720;
const STREAM_MIN_CHARS_PER_SECOND = 80;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function revealText(current: string | undefined, target: string | undefined, elapsedMs: number): string | undefined {
  if (target === undefined) return undefined;
  if (!current) return target.slice(0, 1);
  if (current === target) return target;
  if (!target.startsWith(current)) return target;

  const remaining = target.length - current.length;
  const charsPerSecond = clamp(remaining * STREAM_BACKLOG_CATCHUP_RATE, STREAM_MIN_CHARS_PER_SECOND, STREAM_MAX_CHARS_PER_SECOND);
  const nextLength = current.length + Math.max(1, Math.floor((charsPerSecond * elapsedMs) / 1000));
  return target.slice(0, Math.min(target.length, nextLength));
}

function interpolateStreamTurns(current: readonly AgentSessionTurn[], target: readonly AgentSessionTurn[], elapsedMs: number) {
  let done = true;
  let changed = current.length !== target.length;

  const turns = target.map((targetTurn, turnIndex) => {
    const currentTurn = current[turnIndex]?.id === targetTurn.id ? current[turnIndex] : undefined;
    if (!currentTurn) return targetTurn;

    const events = targetTurn.events.map((targetEvent, eventIndex) => {
      const currentEvent = currentTurn.events[eventIndex]?.id === targetEvent.id ? currentTurn.events[eventIndex] : undefined;
      if (!currentEvent || targetEvent.type === "tool") return targetEvent;
      if (currentEvent.type !== targetEvent.type) return targetEvent;

      const content = revealText(currentEvent.content, targetEvent.content, elapsedMs) ?? "";
      if (content !== targetEvent.content) done = false;
      if (content !== currentEvent.content) changed = true;
      if (content === targetEvent.content) return targetEvent;

      return {
        ...targetEvent,
        content,
      };
    });

    if (events.length !== currentTurn.events.length || events.some((event, index) => event !== currentTurn.events[index])) changed = true;
    return events.every((event, index) => event === targetTurn.events[index]) ? targetTurn : {...targetTurn, events};
  });

  return {changed, done, turns};
}

export function interpolateStreamTurn(current: AgentSessionTurn | null, target: AgentSessionTurn, elapsedMs: number) {
  const result = interpolateStreamTurns(current ? [current] : [], [target], elapsedMs);
  return {changed: result.changed, done: result.done, turn: result.turns[0] ?? target};
}
