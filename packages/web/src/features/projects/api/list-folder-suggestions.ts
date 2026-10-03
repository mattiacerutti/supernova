import {queryOptions, useQuery} from "@tanstack/react-query";
import {projectKeys} from "@/features/projects/api/query-keys";
import {unwrap} from "@/rpc/runtime-result";
import type {RuntimeClient} from "@/rpc/transport/runtime-client";
import {useRuntime} from "@/rpc/use-runtime";

export function listFolderSuggestionsQueryOptions(runtime: RuntimeClient, query: string) {
  return queryOptions({
    queryFn: () => unwrap(runtime.folders.listSuggestions({query})),
    queryKey: projectKeys.folderSuggestion(query),
    staleTime: 30_000,
  });
}

export function useListFolderSuggestions(query: string) {
  const runtime = useRuntime();
  return useQuery(listFolderSuggestionsQueryOptions(runtime, query));
}
