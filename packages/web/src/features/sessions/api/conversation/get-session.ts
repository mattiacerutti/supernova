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

interface UseSessionOptions {
  /** Set false to read the cache without asking the server, while the session is still being created. */
  readonly enabled?: boolean;
}

/** Loads a session and observes cache writes synchronously with live-store transitions. */
export function useSession(sessionId: string, options: UseSessionOptions = {}) {
  const queryClient = useQueryClient();
  const {queryKey} = getSessionQueryOptions(sessionId);
  const {error} = useQuery({...getSessionQueryOptions(sessionId), enabled: options.enabled !== false});
  const getSession = () => queryClient.getQueryData<Session>(queryKey);
  const session = useSyncExternalStore((onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange), getSession, getSession);

  return {data: session, error};
}
