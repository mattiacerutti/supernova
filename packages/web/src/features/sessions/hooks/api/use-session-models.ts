import {useQuery} from "@tanstack/react-query";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";
import {Effect} from "effect";

export function useSessionModels() {
  return useQuery(
    eq.queryOptions({
      queryFn: () =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.listModels();
        }),
      queryKey: ["session", "models"] as const,
    })
  );
}
