import {useQuery} from "@tanstack/react-query";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";
import {Effect} from "effect";

export function useSessionModels() {
  return useQuery(
    eq.queryOptions({
      queryFn: () =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.listSessionModels();
        }),
      queryKey: ["session", "models"] as const,
    })
  );
}
