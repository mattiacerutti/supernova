import {useMutation} from "@tanstack/react-query";
import {Effect} from "effect";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";

export function useStartProviderOAuthLogin() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: {providerId: string}) =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.startProviderOAuthLogin(input);
        }),
    })
  );
}
