import {useMutation, useQueryClient} from "@tanstack/react-query";
import type {InfiniteData} from "@tanstack/react-query";
import type {ProjectSessionsListResult} from "@supernova/contracts/services/projects/procedures";
import {forgetSession} from "@/features/sessions/api/sessions-sync";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

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
    mutationFn: (input: ArchiveSessionInput) => unwrap(runtime.projects.archiveSession(input)),
    onMutate: (input) => patchOptimism(input.sessionId, {archived: true}),
    onError: (_error, input) => patchOptimism(input.sessionId, {archived: undefined}),
    onSuccess: async (result) => {
      // Drop it from the loaded pages too, or forgetting its optimism brings the row back.
      queryClient.setQueryData<InfiniteData<ProjectSessionsListResult>>(
        sessionKeys.list(result.projectPath),
        (data) => data && {...data, pages: data.pages.map((page) => ({...page, sessions: page.sessions.filter((session) => session.id !== result.sessionId)}))}
      );
      forgetSession(result.sessionId);
      await queryClient.invalidateQueries({queryKey: sessionKeys.branches(result.projectPath)});
    },
  });
}
