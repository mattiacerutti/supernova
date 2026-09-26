import {useMutation} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

interface CancelProviderLoginInput {
  readonly loginSessionId: string;
}

export function useCancelProviderLogin() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: CancelProviderLoginInput) => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.cancelProviderLogin(input)),
    })
  );
}
