import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

interface ArchiveSessionInput {
  readonly projectPath: string;
  readonly sessionId: string;
}

export function useArchiveSession() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: ArchiveSessionInput) => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.archiveProjectSession(input)),
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({queryKey: sessionKeys.list(result.projectPath)});
      },
    })
  );
}
