import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
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
  /** Also delete the session's worktree and branch. */
  readonly removeWorktree?: boolean;
  readonly sessionId: string;
}

const {patchOptimism} = useSessionsStore.getState();

/** Archives a session, removing its row at once; a failure brings the row back. */
export function useArchiveSession() {
  const runtime = useRuntime();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ArchiveSessionInput) => unwrap(runtime.projects.archiveSession(input, BACKGROUND_CONTEXT)),
    onMutate: (input) => patchOptimism(input.sessionId, {archived: true}),
    onError: (_error, input) => patchOptimism(input.sessionId, {archived: undefined}),
    onSuccess: async (result) => {
      // The runtime dropped the session from its directory before archiving; drop it from the loaded pages too, so
      // forgetting its optimism does not bring the row back.
      queryClient.setQueryData<InfiniteData<ProjectSessionsListResult>>(
        sessionKeys.list(result.projectPath),
        (data) => data && {...data, pages: data.pages.map((page) => ({...page, sessions: page.sessions.filter((session) => session.id !== result.sessionId)}))}
      );
      forgetSession(result.sessionId);
      await queryClient.invalidateQueries({queryKey: sessionKeys.branches(result.projectPath)});
    },
  });
}
