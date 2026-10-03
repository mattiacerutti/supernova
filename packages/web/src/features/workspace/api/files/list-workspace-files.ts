import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {queryOptions, useQuery} from "@tanstack/react-query";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {unwrap} from "@/rpc/runtime-result";
import {useRuntime} from "@/rpc/use-runtime";

export function useWorkspaceFiles(projectPath: string) {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      queryFn: () => unwrap(runtime.workspace.listFiles({projectPath}, BACKGROUND_CONTEXT)),
      queryKey: workspaceKeys.files(projectPath),
      // Git and filesystem failures are deterministic; retrying only delays the message.
      retry: false,
    })
  );
}
