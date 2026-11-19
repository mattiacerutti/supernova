import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {queryOptions, useQuery} from "@tanstack/react-query";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {useRuntime} from "@/runtime/hooks/use-runtime";

export function useWorkspaceFile(projectPath: string, path: string) {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      queryFn: () => runtime.workspace.readFile({path, projectPath}, context),
      queryKey: workspaceKeys.file(projectPath, path),
      // Git and filesystem failures are deterministic.
      retry: false,
    })
  );
}
