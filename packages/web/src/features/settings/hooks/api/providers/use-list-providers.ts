import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function listProvidersQueryKey() {
  return ["agent", "providers"] as const;
}

export function useListProviders() {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listProviders()),
      queryKey: listProvidersQueryKey(),
    })
  );
}
