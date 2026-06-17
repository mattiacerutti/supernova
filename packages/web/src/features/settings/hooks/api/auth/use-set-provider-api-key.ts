import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import {listProvidersQueryKey} from "@/features/settings/hooks/api/use-list-providers";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

export function useSetProviderApiKey() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: {apiKey: string; providerId: string}) => Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc) => rpc.setProviderApiKey(input)),
      onSuccess: async () => {
        await queryClient.invalidateQueries({queryKey: listProvidersQueryKey()});
      },
    })
  );
}
