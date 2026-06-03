import {useMutation} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

export function useCancelProviderLogin() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: {loginSessionId: string}) =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.cancelProviderLogin(input);
        }),
    })
  );
}
