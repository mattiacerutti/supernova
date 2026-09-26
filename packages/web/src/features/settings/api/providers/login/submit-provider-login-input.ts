import {useMutation} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

interface SubmitProviderLoginInputInput {
  readonly input: string;
  readonly loginSessionId: string;
}

export function useSubmitProviderLoginInput() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: SubmitProviderLoginInputInput) => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.submitProviderLoginInput(input)),
    })
  );
}
