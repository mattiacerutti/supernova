import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

/** Branches of the project repository, for choosing where a new session runs. Fails with `WorkspaceNotARepositoryError` for plain folders. */
export function useWorkspaceBranches(projectPath: string, options: {readonly enabled?: boolean} = {}) {
  return useQuery(
    eq.queryOptions({
      enabled: options.enabled !== false && projectPath.length > 0,
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listWorkspaceBranches({projectPath})),
      queryKey: sessionKeys.branches(projectPath),
      refetchOnWindowFocus: false,
      // Not a repository is deterministic; retrying only delays hiding the pickers.
      retry: false,
    })
  );
}
