import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import {allFolderSuggestionsQueryKey} from "@/features/projects/hooks/api/use-list-folder-suggestions";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

interface CreateFolderInput {
  path: string;
}

export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: CreateFolderInput) => Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc) => rpc.createFolder(input)),
      onSuccess: async () => {
        await queryClient.invalidateQueries({queryKey: allFolderSuggestionsQueryKey()});
      },
    })
  );
}
