import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {projectKeys} from "@/features/projects/api/query-keys";
import {useRuntime} from "@/runtime/hooks/use-runtime";

interface CreateFolderInput {
  readonly path: string;
}

export function useCreateFolder() {
  const runtime = useRuntime();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateFolderInput) => runtime.folders.create(input, context),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: projectKeys.folderSuggestions()});
    },
  });
}
