import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {Session} from "@supernova/contracts/sessions/schemas";
import {Effect} from "effect";
import {useSyncExternalStore} from "react";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function getSessionQueryOptions(sessionId: string) {
  return eq.queryOptions({
    queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.getSession({sessionId})),
    queryKey: sessionKeys.detail(sessionId),
    refetchOnWindowFocus: false,
  });
}

/** Loads a session and observes cache writes synchronously with live-store transitions. */
export function useSession(sessionId: string) {
  const queryClient = useQueryClient();
  const {queryKey} = getSessionQueryOptions(sessionId);
  const {error} = useQuery(getSessionQueryOptions(sessionId));
  const session = useSyncExternalStore(
    (onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange),
    () => queryClient.getQueryData<Session>(queryKey),
    () => queryClient.getQueryData<Session>(queryKey)
  );

  return {data: session, error};
}
