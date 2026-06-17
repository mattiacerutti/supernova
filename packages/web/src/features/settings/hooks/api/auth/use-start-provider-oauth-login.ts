import {useMutation} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

export function useStartProviderOAuthLogin() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: {providerId: string}) => Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc) => rpc.startProviderOAuthLogin(input)),
    })
  );
}
