import type {IAgentProjectSessionsListResult} from "@pi-desktop/contracts/projects/procedures";
import {useQueryClient} from "@tanstack/react-query";
import {allProjectSessionsQueryKey} from "@/features/projects/hooks/api/use-list-project-sessions";

export function useCachedSessionTitle(sessionId: string): string | undefined {
  const queryClient = useQueryClient();
  const sessionLists = queryClient.getQueriesData<IAgentProjectSessionsListResult>({queryKey: allProjectSessionsQueryKey()});

  for (const [, result] of sessionLists) {
    const title = result?.sessions.find((session) => session.id === sessionId)?.title;
    if (title) return title;
  }

  return undefined;
}
