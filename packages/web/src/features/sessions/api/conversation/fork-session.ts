import {useMutation, useQueryClient} from "@tanstack/react-query";
import type {Session} from "@supernova/contracts/sessions/schemas";
import {Effect} from "effect";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

interface ForkSessionInput {
  readonly sessionId: string;
  readonly turnId: string;
}

export function useForkSession() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: ForkSessionInput) => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.forkSession(input)),
      onSuccess: async (session: Session) => {
        queryClient.setQueryData(sessionKeys.detail(session.id), session);
        await queryClient.invalidateQueries({queryKey: sessionKeys.list(session.projectPath)});
      },
    })
  );
}
