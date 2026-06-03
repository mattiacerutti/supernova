import {useMutation} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

export function useSubmitProviderLoginInput() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: {input: string; loginSessionId: string}) =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.submitProviderLoginInput(input);
        }),
    })
  );
}
