import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {Session} from "@supernova/contracts/sessions/schemas";
import {Effect} from "effect";
import {useSyncExternalStore} from "react";
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
    queryFn: () => Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc) => rpc.getSession({sessionId})),
    queryKey: sessionQueryKey(sessionId),
    refetchOnWindowFocus: false,
  });
}

/** Loads a session and observes cache writes synchronously with live-store transitions. */
export function useSession(sessionId: string) {
  const queryClient = useQueryClient();
  const {error} = useQuery(sessionQueryOptions(sessionId));
  const session = useSyncExternalStore(
    (onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange),
    () => queryClient.getQueryData<Session>(sessionQueryKey(sessionId)),
    () => queryClient.getQueryData<Session>(sessionQueryKey(sessionId))
  );

  return {data: session, error};
}
