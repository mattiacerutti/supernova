import type {ProjectSessionsListResult} from "@supernova/contracts/projects/procedures";
import {useQueryClient} from "@tanstack/react-query";
import {sessionKeys} from "@/features/sessions/api/query-keys";

export function useCachedSessionTitle(sessionId: string): string | undefined {
  const queryClient = useQueryClient();
  const sessionLists = queryClient.getQueriesData<ProjectSessionsListResult>({queryKey: sessionKeys.lists()});

  for (const [, result] of sessionLists) {
    const title = result?.sessions.find((session) => session.id === sessionId)?.title;
    if (title) return title;
  }

  return undefined;
}
