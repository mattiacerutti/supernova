import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {queryOptions, useQuery} from "@tanstack/react-query";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

export function useWorkspaceDiffContents(projectPath: string, repositoryRoot: string, path: string) {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      queryFn: () => unwrap(runtime.workspace.getDiffContents({path, projectPath, repositoryRoot}, BACKGROUND_CONTEXT)),
      queryKey: workspaceKeys.diff(projectPath, repositoryRoot, path),
      // Git and filesystem failures are deterministic; retrying only delays the message.
      retry: false,
    })
  );
}
