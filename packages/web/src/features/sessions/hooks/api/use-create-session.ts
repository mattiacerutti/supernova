import {useMutation} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

interface CreateSessionMutationInput {
  projectPath: string;
}

export function useCreateSession() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: CreateSessionMutationInput) => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.createSession({projectPath: input.projectPath})),
    })
  );
}
