import {useMutation, useQueryClient} from "@tanstack/react-query";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {unwrap} from "@/rpc/runtime-result";
import {useRuntime} from "@/rpc/use-runtime";

interface ArchiveSessionInput {
  readonly projectPath: string;
  /** Also delete the session's worktree and branch. */
  readonly removeWorktree?: boolean;
  readonly sessionId: string;
}

export function useArchiveSession() {
  const runtime = useRuntime();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ArchiveSessionInput) => unwrap(runtime.projects.archiveSession(input)),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({queryKey: sessionKeys.list(result.projectPath)});
      await queryClient.invalidateQueries({queryKey: sessionKeys.branches(result.projectPath)});
    },
  });
}
