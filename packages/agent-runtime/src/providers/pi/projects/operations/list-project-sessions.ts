import {SessionManager} from "@mariozechner/pi-coding-agent";
import {Effect} from "effect";
import {AgentProjectSessionsListError} from "@pi-desktop/contracts/projects";
import {mapPiSessionsToChats} from "@pi-desktop/agent-runtime/providers/pi/projects/pi-session-mapper";

const DEFAULT_SESSION_LIST_LIMIT = 5;

export function listProjectSessions(input: {cursor?: string; limit?: number; projectPath: string}) {
  return Effect.tryPromise({
    try: async () => {
      // TODO: Watch for performance issues here. SessionManager.list eagerly parses every session; if that becomes slow, replace this with a custom solution.
      const sessions = await SessionManager.list(input.projectPath);
      const limit = input.limit ?? DEFAULT_SESSION_LIST_LIMIT;
      const chats = mapPiSessionsToChats(sessions);
      const page = chats.slice(0, limit);

      return {
        hasMore: chats.length > page.length,
        nextCursor: chats.length > page.length ? page.at(-1)?.id : undefined,
        projectPath: input.projectPath,
        sessions: page,
      };
    },
    catch: (cause) =>
      new AgentProjectSessionsListError({
        cause,
        message: cause instanceof Error ? cause.message : "Failed to list project sessions.",
      }),
  });
}
