interface TimestampedTimelineEvent {
  readonly timestamp: string;
}

export function workDuration(events: readonly TimestampedTimelineEvent[], completedAt: string | undefined): number | undefined {
  const times = events.map((event) => new Date(event.timestamp).getTime());
  const startedAt = times.at(0);
  const completedAtMs = completedAt === undefined ? times.at(-1) : new Date(completedAt).getTime();

  if (startedAt === undefined || completedAtMs === undefined || completedAtMs < startedAt) return undefined;
  return completedAtMs - startedAt;
}

export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined || durationMs < 1000) return "a moment";

  let remainingSeconds = Math.max(1, Math.round(durationMs / 1000));
  const hours = Math.floor(remainingSeconds / 3600);
  remainingSeconds -= hours * 3600;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds - minutes * 60;

  return [hours > 0 ? `${hours}h` : undefined, minutes > 0 ? `${minutes}m` : undefined, seconds > 0 ? `${seconds}s` : undefined].filter((part) => part !== undefined).join(" ");
}
