import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {providerLoginSessionQueryKey} from "@/features/settings/hooks/api/auth/provider-login-session-query-key";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";

export function useProviderLoginSession(loginSessionId: string | undefined) {
  return useQuery(
    eq.queryOptions({
      enabled: !!loginSessionId,
      queryFn: () =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.getProviderLoginSession({loginSessionId: loginSessionId || ""});
        }),
      queryKey: providerLoginSessionQueryKey(loginSessionId),
      refetchInterval: 750,
    })
  );
}
