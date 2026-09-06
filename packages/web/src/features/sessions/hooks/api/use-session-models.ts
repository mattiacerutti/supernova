import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function sessionModelsQueryKey() {
  return ["session", "models"] as const;
}

export function useSessionModels() {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listModels()),
      queryKey: sessionModelsQueryKey(),
    })
  );
}
