import {queryOptions, useQuery} from "@tanstack/react-query";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {unwrap} from "@/rpc/runtime-result";
import {useRuntime} from "@/rpc/use-runtime";

/** Branches of the project repository, for choosing where a new session runs. Fails with `WorkspaceNotARepositoryError` for plain folders. */
export function useWorkspaceBranches(projectPath: string, options: {readonly enabled?: boolean} = {}) {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      enabled: options.enabled !== false && projectPath.length > 0,
      queryFn: () => unwrap(runtime.workspace.listBranches({projectPath})),
      queryKey: sessionKeys.branches(projectPath),
      refetchOnWindowFocus: false,
      // Not a repository is deterministic; retrying only delays hiding the pickers.
      retry: false,
    })
  );
}
