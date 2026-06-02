import type {SessionInfo} from "@earendil-works/pi-coding-agent";
import type {SessionSummary} from "@supernova/contracts/sessions/schemas";

export type PiSessionInfo = Pick<SessionInfo, "cwd" | "firstMessage" | "id" | "modified" | "name">;

/** Chooses the best display title available for a Pi session. */
function toSessionTitle(session: PiSessionInfo): string {
  const explicitName = session.name?.trim();
  if (explicitName) return explicitName;

  const firstMessage = session.firstMessage.trim();
  if (firstMessage.length > 0 && firstMessage !== "(no messages)") return firstMessage;

  return "Untitled session";
}

/** Maps Pi session metadata into a shared session summary. */
export function toPiSessionSummary(session: PiSessionInfo): SessionSummary {
  return {
    id: session.id,
    title: toSessionTitle(session),
    updatedAt: session.modified.toISOString(),
  };
}

/** Maps and sorts Pi sessions as newest-first shared session summaries. */
export function mapPiSessionsToSummaries(sessions: PiSessionInfo[]): SessionSummary[] {
  return sessions.map(toPiSessionSummary).toSorted((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
