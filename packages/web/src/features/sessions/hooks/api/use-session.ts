import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

export function allSessionsQueryKey() {
  return ["session"] as const;
}

export function sessionQueryKey(sessionId: string) {
  return [...allSessionsQueryKey(), sessionId] as const;
}

export function sessionQueryOptions(sessionId: string) {
  return eq.queryOptions({
    queryFn: () =>
      Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc) =>
        rpc.getSession({sessionId}).pipe(Effect.tap((session) => Effect.sync(() => useSessionLiveStore.getState().hydrateSession(session))))
      ),
    queryKey: sessionQueryKey(sessionId),
    refetchOnWindowFocus: false,
  });
}

export function useSession(sessionId: string) {
  return useQuery(sessionQueryOptions(sessionId));
}
