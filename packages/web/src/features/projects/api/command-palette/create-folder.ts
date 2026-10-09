import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import {projectKeys} from "@/features/projects/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

interface CreateFolderInput {
  readonly path: string;
}

export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: CreateFolderInput) => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.createFolder(input)),
      onSuccess: async () => {
        await queryClient.invalidateQueries({queryKey: projectKeys.folderSuggestions()});
      },
    })
  );
}
