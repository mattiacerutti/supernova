import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function useWorkspaceRepositories(projectPath: string) {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listWorkspaceRepositories({projectPath})),
      queryKey: workspaceKeys.repositories(projectPath),
      // Git and filesystem failures are deterministic; retrying only delays the message.
      retry: false,
    })
  );
}
