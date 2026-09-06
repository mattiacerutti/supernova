import {useMutation} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function useCancelProviderLogin() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: {loginSessionId: string}) => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.cancelProviderLogin(input)),
    })
  );
}
