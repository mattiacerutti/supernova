import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {queryOptions, useQuery} from "@tanstack/react-query";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {useRuntime} from "@/runtime/hooks/use-runtime";

export function useWorkspaceFiles(projectPath: string) {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      queryFn: () => runtime.workspace.listFiles({projectPath}, context),
      queryKey: workspaceKeys.files(projectPath),
      // Git and filesystem failures are deterministic.
      retry: false,
    })
  );
}
