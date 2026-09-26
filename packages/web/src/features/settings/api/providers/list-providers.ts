import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {settingsKeys} from "@/features/settings/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function useListProviders() {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listProviders()),
      queryKey: settingsKeys.providers(),
    })
  );
}
