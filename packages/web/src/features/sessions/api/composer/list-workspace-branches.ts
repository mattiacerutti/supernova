import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {queryOptions, useQuery} from "@tanstack/react-query";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {useRuntime} from "@/runtime/hooks/use-runtime";

export function useWorkspaceBranches(projectPath: string, options: {readonly enabled?: boolean} = {}) {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      enabled: options.enabled !== false && projectPath.length > 0,
      queryFn: () => runtime.workspace.listBranches({projectPath}, context),
      queryKey: sessionKeys.branches(projectPath),
      refetchOnWindowFocus: false,
      retry: false,
    })
  );
}
