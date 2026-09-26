import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function useWorkspaceFiles(projectPath: string) {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listWorkspaceFiles({projectPath})),
      queryKey: workspaceKeys.files(projectPath),
      // Git and filesystem failures are deterministic; retrying only delays the message.
      retry: false,
    })
  );
}
