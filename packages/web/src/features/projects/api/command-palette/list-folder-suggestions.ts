import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {projectKeys} from "@/features/projects/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function listFolderSuggestionsQueryOptions(query: string) {
  return eq.queryOptions({
    // Moving to another folder keeps the previous folder's listing on screen until the new one arrives, instead of
    // emptying the list for a frame. Check `isPlaceholderData` before treating the listing as the current folder's.
    placeholderData: (previousData) => previousData,
    queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listFolderSuggestions({query})),
    queryKey: projectKeys.folderSuggestion(query),
    staleTime: 30_000,
  });
}

export function useListFolderSuggestions(query: string) {
  return useQuery(listFolderSuggestionsQueryOptions(query));
}
