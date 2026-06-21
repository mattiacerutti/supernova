import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

export function sessionModelsQueryKey() {
  return ["session", "models"] as const;
}

export function useSessionModels() {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc) => rpc.listModels()),
      queryKey: sessionModelsQueryKey(),
    })
  );
}
