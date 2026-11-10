import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {queryOptions, useQuery} from "@tanstack/react-query";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {useRuntime} from "@/runtime/hooks/use-runtime";

export function useWorkspaceDiffContents(projectPath: string, repositoryRoot: string, path: string) {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      queryFn: () => runtime.workspace.getDiffContents({path, projectPath, repositoryRoot}, context),
      queryKey: workspaceKeys.diff(projectPath, repositoryRoot, path),
      // Git and filesystem failures are deterministic.
      retry: false,
    })
  );
}
