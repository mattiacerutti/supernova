import {resolve} from "node:path";
import type {SessionInfo} from "@earendil-works/pi-coding-agent";
import type {SessionSummary} from "@supernova/contracts/sessions/schemas";

export type PiSessionInfo = Pick<SessionInfo, "cwd" | "firstMessage" | "id" | "modified" | "name" | "parentSessionPath">;

/** Chooses the best display title available for a Pi session. */
function toSessionTitle(session: PiSessionInfo): string {
  const explicitName = session.name?.trim();
  if (explicitName) return explicitName;

  const firstMessage = session.firstMessage.trim();
  if (firstMessage.length > 0 && firstMessage !== "(no messages)") return firstMessage;

  return "Untitled session";
}

/** Maps Pi session metadata into a shared session summary. A session whose cwd is not the project runs in a worktree. */
export function toPiSessionSummary(session: PiSessionInfo, projectPath: string): SessionSummary {
  return {
    id: session.id,
    forked: session.parentSessionPath !== undefined,
    title: toSessionTitle(session),
    updatedAt: session.modified.toISOString(),
    worktree: session.cwd.length > 0 && resolve(session.cwd) !== resolve(projectPath),
  };
}

/** Maps and sorts Pi sessions as newest-first shared session summaries. */
export function toSessionSummaries(sessions: PiSessionInfo[], projectPath: string): SessionSummary[] {
  return sessions.map((session) => toPiSessionSummary(session, projectPath)).toSorted((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
