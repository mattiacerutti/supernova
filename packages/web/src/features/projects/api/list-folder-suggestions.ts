import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {projectKeys} from "@/features/projects/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function listFolderSuggestionsQueryOptions(query: string) {
  return eq.queryOptions({
    queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listFolderSuggestions({query})),
    queryKey: projectKeys.folderSuggestion(query),
    staleTime: 30_000,
  });
}

export function useListFolderSuggestions(query: string) {
  return useQuery(listFolderSuggestionsQueryOptions(query));
}
