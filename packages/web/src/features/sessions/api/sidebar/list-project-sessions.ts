import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function listProjectSessionsQueryOptions(projectPath: string) {
  return eq.queryOptions({
    enabled: projectPath.length > 0,
    placeholderData: (previousData) => previousData,
    queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listProjectSessions({projectPath})),
    queryKey: sessionKeys.list(projectPath),
  });
}

export function useListProjectSessions(projectPath: string) {
  return useQuery(listProjectSessionsQueryOptions(projectPath));
}
