import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

export function listProvidersQueryKey() {
  return ["agent", "providers"] as const;
}

export function useListProviders() {
  return useQuery(
    eq.queryOptions({
      queryFn: () =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.listProviders();
        }),
      queryKey: listProvidersQueryKey(),
    })
  );
}
