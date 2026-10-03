import type {SessionSummary} from "@supernova/contracts/services/sessions/schemas";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";

/** A durable session's index record as the sidebar shows it. */
export function toSessionSummary(record: SessionRecord): SessionSummary {
  return {
    id: record.id,
    forked: record.forkedFrom !== undefined,
    // Untitled until the title arrives; the first message is not indexed.
    title: record.title ?? "Untitled session",
    updatedAt: record.updatedAt,
    worktree: record.worktree !== undefined,
  };
}

/** Sorts summaries newest first. */
export function newestFirst(summaries: readonly SessionSummary[]): SessionSummary[] {
  return summaries.toSorted((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
