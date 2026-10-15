import {queryOptions, useQuery, useQueryClient} from "@tanstack/react-query";
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

export function usePrefetchFolderSuggestions() {
  const runtime = useRuntime();
  const queryClient = useQueryClient();
  return (query: string): Promise<void> => queryClient.prefetchQuery(listFolderSuggestionsQueryOptions(runtime, query));
}
