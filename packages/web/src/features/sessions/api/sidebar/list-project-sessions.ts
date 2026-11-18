import {listedSessions} from "@/features/sessions/lib/session-view";
import {useProjectList} from "@/features/sessions/api/sidebar/session-list";
import {useSessionOptimismStore} from "@/features/sessions/stores/session-optimism-store";

const SESSION_PAGE_SIZE = 5;

export function useListProjectSessions(projectPath: string) {
  const listing = useProjectList(projectPath, SESSION_PAGE_SIZE);
  const optimism = useSessionOptimismStore((state) => state.optimism);
  return {
    sessions: listing.pending ? undefined : listedSessions({items: listing.items, projectPath, optimism}),
    error: listing.error,
    isPending: listing.pending,
    hasMore: listing.hasMore,
    isLoadingMore: listing.loadingMore,
    canShowLess: listing.expanded,
    loadMore: () => listing.view.loadMore(projectPath),
    showFirstPage: () => listing.view.showFirstPage(projectPath),
  };
}
