import {useMutation} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

interface CreateSessionMutationInput {
  projectPath: string;
}

export function useCreateSession() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: CreateSessionMutationInput) =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.createSession({projectPath: input.projectPath});
        }),
    })
  );
}
