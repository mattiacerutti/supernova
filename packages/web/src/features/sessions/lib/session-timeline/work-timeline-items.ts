import type {SessionToolTurnEvent} from "@supernova/contracts/sessions/schemas";
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
  return event.tool?.kind === "command" ? "server" : "folder";
}

export function getWorkSummary(event: SessionToolTurnEvent): string {
  const pending = event.tool?.status === "pending";

  switch (event.tool?.kind) {
    case "command":
      return pending ? "Running command" : "Ran command";
    case "file-read":
      return pending ? "Reading file" : "Read file";
    case "file-list":
      return pending ? "Listing files" : "Listed files";
    case "file-edit":
      return pending ? "Editing file" : "Edited file";
    case "file-find":
      return pending ? "Exploring files" : "Explored files";
    default:
      return pending ? "Running tool" : "Ran tool";
  }
}
