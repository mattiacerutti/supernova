import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";

export function listFolderSuggestionsQueryKey(query: string) {
  return ["agent", "folder", "suggestions", query] as const;
}

export function useListFolderSuggestions(query: string) {
  return useQuery(
    eq.queryOptions({
      placeholderData: (previousData) => previousData,
      queryFn: () =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.listFolderSuggestions({query});
        }),
      queryKey: listFolderSuggestionsQueryKey(query),
    })
  );
}
