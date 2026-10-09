import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {queryOptions, useQuery, useQueryClient} from "@tanstack/react-query";
import {projectKeys} from "@/features/projects/api/query-keys";
import {unwrap} from "@/runtime/runtime-result";
import type {RuntimeClient} from "@/runtime/transport/runtime-client";
import {useRuntime} from "@/runtime/use-runtime";

export function listFolderSuggestionsQueryOptions(runtime: RuntimeClient, query: string) {
  return queryOptions({
    // Moving to another folder keeps the previous folder's listing on screen until the new one arrives, instead of
    // emptying the list for a frame. Check `isPlaceholderData` before treating the listing as the current folder's.
    placeholderData: (previousData) => previousData,
    queryFn: () => unwrap(runtime.folders.listSuggestions({query}, BACKGROUND_CONTEXT)),
    queryKey: projectKeys.folderSuggestion(query),
    staleTime: 30_000,
  });
}

export function useListFolderSuggestions(query: string) {
  const runtime = useRuntime();
  return useQuery(listFolderSuggestionsQueryOptions(runtime, query));
}

/** Loads a folder's listing ahead of time, such as the folder the user is about to enter. */
export function usePrefetchFolderSuggestions() {
  const runtime = useRuntime();
  const queryClient = useQueryClient();
  return (query: string): Promise<void> => queryClient.prefetchQuery(listFolderSuggestionsQueryOptions(runtime, query));
}
