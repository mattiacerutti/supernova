import {listedSessions} from "@/features/sessions/lib/session-view";
import {useProjectList} from "@/features/sessions/api/sidebar/session-list";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";

const SESSION_PAGE_SIZE = 5;

export function useListProjectSessions(projectPath: string) {
  const listing = useProjectList(projectPath, SESSION_PAGE_SIZE);
  const optimism = useSessionsStore((state) => state.optimism);
  // A session this client is starting has a record before any listing has it.
  const records = useSessionsStore((state) => state.records);
  return {
    sessions: listing.pending ? undefined : listedSessions({items: listing.items, projectPath, starting: Object.values(records), optimism}),
    error: listing.error,
    isPending: listing.pending,
    hasMore: listing.hasMore,
    isLoadingMore: listing.loadingMore,
    canShowLess: listing.expanded,
    loadMore: () => listing.view.loadMore(projectPath),
    showFirstPage: () => listing.view.showFirstPage(projectPath),
  };
}
