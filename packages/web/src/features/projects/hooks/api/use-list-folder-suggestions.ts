import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function allFolderSuggestionsQueryKey() {
  return ["agent", "folder", "suggestions"] as const;
}

export function listFolderSuggestionsQueryKey(query: string) {
  return [...allFolderSuggestionsQueryKey(), query] as const;
}

/** Builds shared query options for browsing local folders. */
export function listFolderSuggestionsQueryOptions(query: string) {
  return eq.queryOptions({
    queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listFolderSuggestions({query})),
    queryKey: listFolderSuggestionsQueryKey(query),
    staleTime: 30_000,
  });
}

export function useListFolderSuggestions(query: string) {
  return useQuery(listFolderSuggestionsQueryOptions(query));
}
