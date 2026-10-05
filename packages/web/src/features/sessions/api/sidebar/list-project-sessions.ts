import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {infiniteQueryOptions, useInfiniteQuery, useQueryClient} from "@tanstack/react-query";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {projectSessions} from "@/features/sessions/lib/session-view";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {unwrap} from "@/runtime/runtime-result";
import type {RuntimeClient} from "@/runtime/transport/runtime-client";
import {useRuntime} from "@/runtime/use-runtime";

/** Sessions the sidebar reads per page of a project; each "Show more" reveals one more page. */
const SESSION_PAGE_SIZE = 5;

function listProjectSessionsQueryOptions(runtime: RuntimeClient, projectPath: string) {
  return infiniteQueryOptions({
    enabled: projectPath.length > 0,
    queryKey: sessionKeys.list(projectPath),
    queryFn: ({pageParam}) => unwrap(runtime.projects.listSessions({projectPath, limit: SESSION_PAGE_SIZE, ...(pageParam ? {cursor: pageParam} : {})}, BACKGROUND_CONTEXT)),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/**
 * A project's sessions as the sidebar lists them, a page at a time: `loadMore` reads the next page, `showFirstPage`
 * goes back to the first. What the runtime reports and the user's pins and renames keep the loaded rows current.
 */
export function useListProjectSessions(projectPath: string) {
  const queryClient = useQueryClient();
  const options = listProjectSessionsQueryOptions(useRuntime(), projectPath);
  const query = useInfiniteQuery(options);
  const entries = useSessionsStore((state) => state.entries);
  const optimism = useSessionsStore((state) => state.optimism);
  const loaded = query.data?.pages.flatMap((page) => page.sessions);
  return {
    sessions: loaded && projectSessions({entries, loaded, optimism, projectPath}),
    error: query.error,
    isPending: query.isPending,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    canShowLess: (query.data?.pages.length ?? 0) > 1,
    loadMore: () => void query.fetchNextPage(),
    showFirstPage: () => queryClient.setQueryData(options.queryKey, (data) => data && {pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1)}),
  };
}
