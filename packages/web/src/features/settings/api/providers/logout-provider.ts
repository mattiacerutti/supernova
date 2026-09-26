import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import {settingsKeys} from "@/features/settings/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

interface LogoutProviderInput {
  readonly providerId: string;
}

export function useLogoutProvider() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: LogoutProviderInput) => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.logoutProvider(input)),
      onSuccess: async () => {
        await queryClient.invalidateQueries({queryKey: settingsKeys.providers()});
      },
    })
  );
}
