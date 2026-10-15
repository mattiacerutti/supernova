import {queryOptions, useQuery} from "@tanstack/react-query";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

export function useWorkspaceBranches(projectPath: string, options: {readonly enabled?: boolean} = {}) {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      enabled: options.enabled !== false && projectPath.length > 0,
      queryFn: () => unwrap(runtime.workspace.listBranches({projectPath})),
      queryKey: sessionKeys.branches(projectPath),
      refetchOnWindowFocus: false,
      retry: false,
    })
  );
}
