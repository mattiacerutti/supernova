import {useQuery} from "@tanstack/react-query";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";
import {Effect} from "effect";

export function sessionQueryKey(sessionId: string) {
  return ["session", sessionId] as const;
}

export function useSession(sessionId: string) {
  return useQuery(
    eq.queryOptions({
      queryFn: () =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.getSession({sessionId});
        }),
      queryKey: sessionQueryKey(sessionId),
    })
  );
}
