import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function useWorkspaceDiffContents(projectPath: string, repositoryRoot: string, path: string) {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.getWorkspaceDiffContents({path, projectPath, repositoryRoot})),
      queryKey: workspaceKeys.diff(projectPath, repositoryRoot, path),
      // Git and filesystem failures are deterministic; retrying only delays the message.
      retry: false,
    })
  );
}
