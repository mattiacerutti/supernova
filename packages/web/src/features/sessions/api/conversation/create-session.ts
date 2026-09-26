import {useMutation} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

interface CreateSessionInput {
  readonly projectPath: string;
}

export function useCreateSession() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: CreateSessionInput) => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.createSession(input)),
    })
  );
}
