import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

export function sessionQueryKey(sessionId: string) {
  return ["session", sessionId] as const;
}

export function sessionQueryOptions(sessionId: string) {
  return eq.queryOptions({
    queryFn: () =>
      Effect.gen(function* () {
        const rpc = yield* AgentRpcProtocolClientService;
        const session = yield* rpc.getSession({sessionId});
        yield* Effect.sync(() => useSessionLiveStore.getState().hydrateSession(session));
        return session;
      }),
    queryKey: sessionQueryKey(sessionId),
    refetchOnWindowFocus: false,
  });
}

export function useSession(sessionId: string) {
  return useQuery(sessionQueryOptions(sessionId));
}
