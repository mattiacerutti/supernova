import {useMutation} from "@tanstack/react-query";
import type {ProviderLoginStartPayload} from "@supernova/contracts/providers/procedures";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

export function useStartProviderLogin() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: ProviderLoginStartPayload) => Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc) => rpc.startProviderLogin(input)),
    })
  );
}
