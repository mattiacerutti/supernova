import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";

interface ICreateFolderInput {
  path: string;
}

export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: ICreateFolderInput) =>
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
