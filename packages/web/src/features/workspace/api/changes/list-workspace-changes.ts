import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {queryOptions, useQuery} from "@tanstack/react-query";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {useRuntime} from "@/runtime/hooks/use-runtime";

export function useWorkspaceChanges(projectPath: string, repositoryRoot: string) {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      queryFn: () => runtime.workspace.getChanges({projectPath, repositoryRoot}, context),
      queryKey: workspaceKeys.changes(projectPath, repositoryRoot),
      // Git and filesystem failures are deterministic.
      retry: false,
    })
  );
}
