import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {queryOptions, usePrefetchQuery, useQuery, useQueryClient} from "@tanstack/react-query";
import {projectKeys} from "@/features/projects/api/query-keys";
import type {RuntimeClient} from "@/runtime/client";
import {useRuntime} from "@/runtime/hooks/use-runtime";

export function listFolderSuggestionsQueryOptions(runtime: RuntimeClient, query: string) {
  return queryOptions({
    placeholderData: (previousData) => previousData,
    queryFn: () => runtime.folders.listSuggestions({query}, context),
    queryKey: projectKeys.folderSuggestion(query),
    staleTime: 30_000,
  });
}

export function useListFolderSuggestions(query: string) {
  const runtime = useRuntime();
  return useQuery(listFolderSuggestionsQueryOptions(runtime, query));
}

export function usePrefetchHomeFolderSuggestions() {
  const runtime = useRuntime();
  usePrefetchQuery({...listFolderSuggestionsQueryOptions(runtime, ""), gcTime: Infinity});
}

export function usePrefetchFolderSuggestions() {
  const runtime = useRuntime();
  const queryClient = useQueryClient();
  return (query: string): Promise<void> => queryClient.prefetchQuery(listFolderSuggestionsQueryOptions(runtime, query));
}
