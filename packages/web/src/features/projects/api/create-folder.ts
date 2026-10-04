import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {projectKeys} from "@/features/projects/api/query-keys";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

interface CreateFolderInput {
  readonly path: string;
}

export function useCreateFolder() {
  const runtime = useRuntime();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateFolderInput) => unwrap(runtime.folders.create(input, BACKGROUND_CONTEXT)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: projectKeys.folderSuggestions()});
    },
  });
}
