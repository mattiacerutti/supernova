import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import {listProvidersQueryKey} from "@/features/settings/hooks/api/use-list-providers";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";

export function useSetProviderApiKey() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: {apiKey: string; providerId: string}) =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.setProviderApiKey(input);
        }),
      onSuccess: async () => {
        await queryClient.invalidateQueries({queryKey: listProvidersQueryKey()});
      },
    })
  );
}
