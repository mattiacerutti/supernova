import {useQuery} from "@tanstack/react-query";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

export function listFolderSuggestionsQueryKey(query: string) {
  return ["agent", "folder", "suggestions", query] as const;
}

export function useListFolderSuggestions(query: string) {
  const client = useAgentRpcClient();

  return useQuery({
    queryFn: () => client.run((rpc) => rpc.folderSuggestionsList({query})),
    queryKey: listFolderSuggestionsQueryKey(query),
  });
}
