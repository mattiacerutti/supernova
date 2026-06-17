import {useQuery} from "@tanstack/react-query";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";
import {Effect} from "effect";

export function useSessionModels() {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc) => rpc.listModels()),
      queryKey: ["session", "models"] as const,
    })
  );
}
