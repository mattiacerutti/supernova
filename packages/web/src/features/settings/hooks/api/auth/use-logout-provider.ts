import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import {listProvidersQueryKey} from "@/features/settings/hooks/api/use-list-providers";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";

export function useLogoutProvider() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: {providerId: string}) =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.logoutProvider(input);
        }),
      onSuccess: async () => {
        await queryClient.invalidateQueries({queryKey: listProvidersQueryKey()});
      },
    })
  );
}
