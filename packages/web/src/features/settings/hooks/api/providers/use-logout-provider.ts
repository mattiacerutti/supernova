import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import {listProvidersQueryKey} from "@/features/settings/hooks/api/providers/use-list-providers";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function useLogoutProvider() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: {providerId: string}) => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.logoutProvider(input)),
      onSuccess: async () => {
        await queryClient.invalidateQueries({queryKey: listProvidersQueryKey()});
      },
    })
  );
}
