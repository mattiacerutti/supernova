import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

export function allFolderSuggestionsQueryKey() {
  return ["agent", "folder", "suggestions"] as const;
}

export function listFolderSuggestionsQueryKey(query: string) {
  return [...allFolderSuggestionsQueryKey(), query] as const;
}

export function useListFolderSuggestions(query: string) {
  return useQuery(
    eq.queryOptions({
      placeholderData: (previousData) => previousData,
      queryFn: () => Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc) => rpc.listFolderSuggestions({query})),
      queryKey: listFolderSuggestionsQueryKey(query),
    })
  );
}
