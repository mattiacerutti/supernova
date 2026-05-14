import type {SessionToolTurnEvent} from "@pi-desktop/contracts/sessions/schemas";
import type {SessionWorkEvent} from "@/features/sessions/types/session-timeline-item";

export function workDuration(events: readonly SessionWorkEvent[], completedAt: string | undefined): number | undefined {
  const times = events.map((event) => new Date(event.timestamp).getTime());
  const startedAt = times.at(0);
  const completedAtMs = completedAt === undefined ? times.at(-1) : new Date(completedAt).getTime();

  if (startedAt === undefined || completedAtMs === undefined || completedAtMs < startedAt) return undefined;
  return completedAtMs - startedAt;
}

export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined || durationMs < 1000) return "a moment";
  return `${Math.max(1, Math.round(durationMs / 1000))}s`;
}

export function getWorkIconName(event: SessionToolTurnEvent): "folder" | "server" {
  return event.tool?.name === "bash" ? "server" : "folder";
}
