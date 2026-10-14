import {queryOptions, useQuery} from "@tanstack/react-query";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

export function useWorkspaceChanges(projectPath: string, repositoryRoot: string) {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      queryFn: () => unwrap(runtime.workspace.getChanges({projectPath, repositoryRoot})),
      queryKey: workspaceKeys.changes(projectPath, repositoryRoot),
      // Git and filesystem failures are deterministic; retrying only delays the message.
      retry: false,
    })
  );
}
