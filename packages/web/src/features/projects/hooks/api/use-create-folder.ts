import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";

interface CreateFolderInput {
  path: string;
}

export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: CreateFolderInput) =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.createFolder(input);
        }),
      onSuccess: async () => {
        await queryClient.invalidateQueries({queryKey: ["agent", "folder", "suggestions"]});
      },
    })
  );
}
