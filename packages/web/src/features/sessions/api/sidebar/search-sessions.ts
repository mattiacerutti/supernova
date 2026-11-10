import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {infiniteQueryOptions, keepPreviousData, useInfiniteQuery} from "@tanstack/react-query";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import type {RuntimeClient} from "@/runtime/client";
import {useRuntime} from "@/runtime/hooks/use-runtime";

const SEARCH_PAGE_SIZE = 30;

function searchSessionsQueryOptions(runtime: RuntimeClient, text: string, projectPaths: readonly string[]) {
  return infiniteQueryOptions({
    queryKey: sessionKeys.search(text, projectPaths),
    queryFn: ({pageParam}) => runtime.sessions.search({text, projectPaths: [...projectPaths], limit: SEARCH_PAGE_SIZE, ...(pageParam ? {cursor: pageParam} : {})}, context),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useSearchSessions(text: string, projectPaths: readonly string[]) {
  const search = useInfiniteQuery(searchSessionsQueryOptions(useRuntime(), text, projectPaths));
  return {
    sessions: search.data?.pages.flatMap((page) => page.sessions) ?? [],
    isPending: search.isPending || search.isPlaceholderData,
    hasMore: search.hasNextPage,
    loadMore: () => {
      if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
    },
  };
}
