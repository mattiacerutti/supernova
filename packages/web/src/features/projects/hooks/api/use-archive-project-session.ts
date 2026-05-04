import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import {listProjectSessionsQueryKey} from "@/features/projects/hooks/api/use-list-project-sessions";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

interface IArchiveProjectSessionInput {
  projectPath: string;
  sessionId: string;
}

export function useArchiveProjectSession() {
  const queryClient = useQueryClient();
  const rpcClient = useAgentRpcClient();

  return useMutation({
    mutationFn: (input: IArchiveProjectSessionInput) => rpcClient.run((rpc) => Effect.suspend(() => rpc.archiveProjectSession(input))),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({queryKey: listProjectSessionsQueryKey(result.projectPath)});
    },
  });
}
