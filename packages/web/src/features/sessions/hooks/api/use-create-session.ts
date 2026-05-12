import {useMutation} from "@tanstack/react-query";
import {Effect} from "effect";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";

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
