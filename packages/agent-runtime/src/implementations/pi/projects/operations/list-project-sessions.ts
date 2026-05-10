import {Effect} from "effect";
import {AgentProjectSessionsListError} from "@pi-desktop/contracts/projects";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {mapPiSessionsToSummaries} from "@pi-desktop/agent-runtime/implementations/pi/projects/pi-session-mapper";

const DEFAULT_SESSION_LIST_LIMIT = 5;

function startIndexAfterCursor<T extends {id: string}>(items: readonly T[], cursor: string | undefined): number {
  if (!cursor) return 0;

  const cursorIndex = items.findIndex((item) => item.id === cursor);
  return cursorIndex === -1 ? items.length : cursorIndex + 1;
}

export function listProjectSessions(input: {cursor?: string; limit?: number; projectPath: string}) {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return yield* Effect.tryPromise({
      try: async () => {
        // TODO: Watch for performance issues here. SessionManager.list eagerly parses every session; if that becomes slow, replace this with a custom solution.
        const sessions = await piSdk.SessionManager.list(input.projectPath);
        const limit = input.limit ?? DEFAULT_SESSION_LIST_LIMIT;
        const sessionSummaries = mapPiSessionsToSummaries(sessions);
        const startIndex = startIndexAfterCursor(sessionSummaries, input.cursor);
        const page = sessionSummaries.slice(startIndex, startIndex + limit);
        const hasMore = sessionSummaries.length > startIndex + page.length;

        return {
          hasMore,
          nextCursor: hasMore ? page.at(-1)?.id : undefined,
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
  });
}
