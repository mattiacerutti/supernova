import {resolve} from "node:path";
import type {SessionInfo} from "@earendil-works/pi-coding-agent";
import type {SessionSummary} from "@supernova/contracts/sessions/schemas";
import {sessionIdFromPath} from "@supernova/agent-runtime/pi/lib/session/open-session";
import {readSessionWorktree} from "@supernova/agent-runtime/pi/lib/session/worktree-entry";

export type PiSessionInfo = Pick<SessionInfo, "cwd" | "firstMessage" | "id" | "modified" | "name" | "parentSessionPath" | "path">;

/** Chooses the best display title available for a Pi session. */
function toSessionTitle(session: PiSessionInfo): string {
  const explicitName = session.name?.trim();
  if (explicitName) return explicitName;

  const firstMessage = session.firstMessage.trim();
  if (firstMessage.length > 0 && firstMessage !== "(no messages)") return firstMessage;

  return "Untitled session";
}

/** Maps Pi session metadata into a shared session summary. Only a session whose cwd is not the project can run in a worktree, so only those files are read. */
export async function toPiSessionSummary(session: PiSessionInfo, projectPath: string): Promise<SessionSummary> {
  const outsideProject = session.cwd.length > 0 && resolve(session.cwd) !== resolve(projectPath);
  return {
    id: session.id,
    parentSessionId: session.parentSessionPath ? sessionIdFromPath(session.parentSessionPath) : undefined,
    title: toSessionTitle(session),
    updatedAt: session.modified.toISOString(),
    worktree: outsideProject ? await readSessionWorktree(session.path) : undefined,
  };
}

/** Maps and sorts Pi sessions as newest-first shared session summaries. */
export async function toSessionSummaries(sessions: PiSessionInfo[], projectPath: string): Promise<SessionSummary[]> {
  const summaries = await Promise.all(sessions.map((session) => toPiSessionSummary(session, projectPath)));
  return summaries.toSorted((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
