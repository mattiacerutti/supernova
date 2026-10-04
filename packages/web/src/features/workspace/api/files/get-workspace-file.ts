import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {queryOptions, useQuery} from "@tanstack/react-query";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

export function useWorkspaceFile(projectPath: string, path: string) {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      queryFn: () => unwrap(runtime.workspace.readFile({path, projectPath}, BACKGROUND_CONTEXT)),
      queryKey: workspaceKeys.file(projectPath, path),
      // Git and filesystem failures are deterministic; retrying only delays the message.
      retry: false,
    })
  );
}
