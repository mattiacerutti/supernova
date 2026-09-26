import {useMutation} from "@tanstack/react-query";
import type {ProviderLoginStartPayload} from "@supernova/contracts/providers/procedures";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function useStartProviderLogin() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: ProviderLoginStartPayload) => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.startProviderLogin(input)),
    })
  );
}
