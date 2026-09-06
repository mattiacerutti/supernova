import {useMutation} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function useSubmitProviderLoginInput() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: {input: string; loginSessionId: string}) => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.submitProviderLoginInput(input)),
    })
  );
}
