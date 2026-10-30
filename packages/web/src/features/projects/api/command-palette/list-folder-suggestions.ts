import {queryOptions, usePrefetchQuery, useQuery, useQueryClient} from "@tanstack/react-query";
import {projectKeys} from "@/features/projects/api/query-keys";
import {unwrap} from "@/runtime/runtime-result";
import type {RuntimeClient} from "@/runtime/transport/runtime-client";
import {useRuntime} from "@/runtime/use-runtime";

export function listFolderSuggestionsQueryOptions(runtime: RuntimeClient, query: string) {
  return queryOptions({
    // Keeps the previous folder's listing until the new one arrives; callers check `isPlaceholderData`.
    placeholderData: (previousData) => previousData,
    queryFn: () => unwrap(runtime.folders.listSuggestions({query})),
    queryKey: projectKeys.folderSuggestion(query),
    staleTime: 30_000,
  });
}

export function useListFolderSuggestions(query: string) {
  const runtime = useRuntime();
  return useQuery(listFolderSuggestionsQueryOptions(runtime, query));
}

/** Open project lists the home folder first; keeping it cached for the app's run means the page always opens with its folders. */
export function usePrefetchHomeFolderSuggestions() {
  const runtime = useRuntime();
  usePrefetchQuery({...listFolderSuggestionsQueryOptions(runtime, ""), gcTime: Infinity});
}

export function usePrefetchFolderSuggestions() {
  const runtime = useRuntime();
  const queryClient = useQueryClient();
  return (query: string): Promise<void> => queryClient.prefetchQuery(listFolderSuggestionsQueryOptions(runtime, query));
}
