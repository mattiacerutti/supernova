import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import {providerLoginSessionQueryKey} from "@/features/settings/hooks/api/auth/provider-login-session-query-key";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";

export function useSubmitProviderLoginInput() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: {input: string; loginSessionId: string}) =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.submitProviderLoginInput(input);
        }),
      onSuccess: async (session) => {
        await queryClient.invalidateQueries({queryKey: providerLoginSessionQueryKey(session.loginSessionId)});
      },
    })
  );
}
