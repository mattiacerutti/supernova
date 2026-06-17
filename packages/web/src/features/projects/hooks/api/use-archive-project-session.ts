import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import {listProjectSessionsQueryKey} from "@/features/projects/hooks/api/use-list-project-sessions";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";
import {eq} from "@/rpc/effect-query";

interface ArchiveProjectSessionInput {
  projectPath: string;
  sessionId: string;
}

export function useArchiveProjectSession() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: ArchiveProjectSessionInput) => Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc) => rpc.archiveProjectSession(input)),
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({queryKey: listProjectSessionsQueryKey(result.projectPath)});
      },
    })
  );
}
