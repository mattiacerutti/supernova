import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {queryOptions, useQuery} from "@tanstack/react-query";
import {projectKeys} from "@/features/projects/api/query-keys";
import {unwrap} from "@/runtime/runtime-result";
import type {RuntimeClient} from "@/runtime/transport/runtime-client";
import {useRuntime} from "@/runtime/use-runtime";

export function listFolderSuggestionsQueryOptions(runtime: RuntimeClient, query: string) {
  return queryOptions({
    queryFn: () => unwrap(runtime.folders.listSuggestions({query}, BACKGROUND_CONTEXT)),
    queryKey: projectKeys.folderSuggestion(query),
    staleTime: 30_000,
  });
}

export function useListFolderSuggestions(query: string) {
  const runtime = useRuntime();
  return useQuery(listFolderSuggestionsQueryOptions(runtime, query));
}
