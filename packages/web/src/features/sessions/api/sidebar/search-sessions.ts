import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {infiniteQueryOptions, keepPreviousData, useInfiniteQuery} from "@tanstack/react-query";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {unwrap} from "@/runtime/runtime-result";
import type {RuntimeClient} from "@/runtime/transport/runtime-client";
import {useRuntime} from "@/runtime/use-runtime";

/** Matching sessions read per page. */
const SEARCH_PAGE_SIZE = 30;

function searchSessionsQueryOptions(runtime: RuntimeClient, query: string, projectPaths: readonly string[]) {
  return infiniteQueryOptions({
    queryKey: sessionKeys.search(query, projectPaths),
    queryFn: ({pageParam}) =>
      unwrap(runtime.projects.searchSessions({query, projectPaths: [...projectPaths], limit: SEARCH_PAGE_SIZE, ...(pageParam ? {cursor: pageParam} : {})}, BACKGROUND_CONTEXT)),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    // The previous query's results stay while the next one loads, so typing does not flash an empty list.
    placeholderData: keepPreviousData,
  });
}

/** Sessions across `projectPaths` whose title contains `query`, newest first, a page at a time. */
export function useSearchSessions(query: string, projectPaths: readonly string[]) {
  const search = useInfiniteQuery(searchSessionsQueryOptions(useRuntime(), query, projectPaths));
  return {
    sessions: search.data?.pages.flatMap((page) => page.sessions) ?? [],
    isPending: search.isPending,
    hasMore: search.hasNextPage,
    loadMore: () => {
      if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
    },
  };
}
