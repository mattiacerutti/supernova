import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {forgetSession} from "@/features/sessions/api/sessions-sync";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {useRuntime} from "@/runtime/hooks/use-runtime";

interface ArchiveSessionInput {
  readonly projectPath: string;
  readonly removeWorktree?: boolean;
  readonly sessionId: string;
}

const {patchOptimism} = useSessionsStore.getState();

export function useArchiveSession() {
  const runtime = useRuntime();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ArchiveSessionInput) => runtime.sessions.archive(input, context),
    onMutate: (input) => patchOptimism(input.sessionId, {archived: true}),
    onError: (_error, input) => patchOptimism(input.sessionId, {archived: undefined}),
    onSuccess: async (result) => {
      forgetSession(result.sessionId);
      await queryClient.invalidateQueries({queryKey: sessionKeys.branches(result.projectPath)});
    },
  });
}
