import type {SessionInfo} from "@earendil-works/pi-coding-agent";
import type {SessionSummary} from "@pi-desktop/contracts/sessions/schemas";

export type PiSessionInfo = Pick<SessionInfo, "cwd" | "firstMessage" | "id" | "modified" | "name">;

function toSessionTitle(session: PiSessionInfo): string {
  const explicitName = session.name?.trim();
  if (explicitName) return explicitName;

  const firstMessage = session.firstMessage.trim();
  if (firstMessage.length > 0 && firstMessage !== "(no messages)") return firstMessage;

  return "Untitled session";
}

export function toPiSessionSummary(session: PiSessionInfo): SessionSummary {
  return {
    id: session.id,
    title: toSessionTitle(session),
    updatedAt: session.modified.toISOString(),
  };
}

export function mapPiSessionsToSummaries(sessions: PiSessionInfo[]): SessionSummary[] {
  return sessions.map(toPiSessionSummary).toSorted((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
