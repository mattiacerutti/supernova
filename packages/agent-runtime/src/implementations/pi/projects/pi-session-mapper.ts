import type {SessionInfo} from "@mariozechner/pi-coding-agent";
import type {IAgentSessionSummary} from "@pi-desktop/contracts/sessions/schemas";

export type PiSessionInfo = Pick<SessionInfo, "cwd" | "firstMessage" | "id" | "modified" | "name">;

function toSessionTitle(session: PiSessionInfo): string {
  const explicitName = session.name?.trim();
  if (explicitName) return explicitName;

  const firstMessage = session.firstMessage.trim();
  if (firstMessage.length > 0 && firstMessage !== "(no messages)") return firstMessage;

  return "Untitled session";
}

export function toPiSessionSummary(session: PiSessionInfo): IAgentSessionSummary {
  return {
    id: session.id,
    title: toSessionTitle(session),
    updatedAt: session.modified.toISOString(),
  };
}

export function mapPiSessionsToSummaries(sessions: PiSessionInfo[]): IAgentSessionSummary[] {
  return sessions.map(toPiSessionSummary).toSorted((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
