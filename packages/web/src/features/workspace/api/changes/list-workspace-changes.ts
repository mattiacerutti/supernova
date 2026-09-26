import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function useWorkspaceChanges(projectPath: string, repositoryRoot: string) {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.getWorkspaceChanges({projectPath, repositoryRoot})),
      queryKey: workspaceKeys.changes(projectPath, repositoryRoot),
      // Git and filesystem failures are deterministic; retrying only delays the message.
      retry: false,
    })
  );
}
