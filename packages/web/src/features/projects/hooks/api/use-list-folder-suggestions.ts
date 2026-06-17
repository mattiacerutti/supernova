import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

function listFolderSuggestionsQueryKey(query: string) {
  return ["agent", "folder", "suggestions", query] as const;
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
