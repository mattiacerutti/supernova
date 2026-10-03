import {queryOptions, useQuery, useQueryClient} from "@tanstack/react-query";
import type {Session} from "@supernova/contracts/sessions/schemas";
import {useSyncExternalStore} from "react";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import type {RuntimeClient} from "@/rpc/transport/runtime-client";
import {useRuntime} from "@/rpc/use-runtime";

export function getSessionQueryOptions(services: RuntimeClient, sessionId: string) {
  return queryOptions({
    queryFn: async (): Promise<Session> => {
      const result = await services.management.read({sessionId});
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    },
    queryKey: sessionKeys.detail(sessionId),
    refetchOnWindowFocus: false,
  });
}

interface UseSessionOptions {
  /** Set false to read the cache without asking the server, while the session is still being created. */
  readonly enabled?: boolean;
}

/**
 * Loads a session and observes cache writes synchronously with live-store transitions. While the session is open,
 * its transcript's replicated state keeps the cache current (see `session-events`).
 */
export function useSession(sessionId: string, options: UseSessionOptions = {}) {
  const queryClient = useQueryClient();
  const services = useRuntime();
  const {queryKey} = getSessionQueryOptions(services, sessionId);
  const {error} = useQuery({...getSessionQueryOptions(services, sessionId), enabled: options.enabled !== false});
  const getSession = () => queryClient.getQueryData<Session>(queryKey);
  const session = useSyncExternalStore((onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange), getSession, getSession);

  return {data: session, error};
}
