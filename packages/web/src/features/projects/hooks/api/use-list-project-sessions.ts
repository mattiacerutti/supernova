import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

export function allProjectSessionsQueryKey() {
  return ["agent", "project", "sessions"] as const;
}

export function listProjectSessionsQueryKey(projectPath: string) {
  return [...allProjectSessionsQueryKey(), projectPath] as const;
}

/** Builds shared query options for loading sessions belonging to one project. */
export function listProjectSessionsQueryOptions(projectPath: string) {
  return eq.queryOptions({
    enabled: projectPath.length > 0,
    placeholderData: (previousData) => previousData,
    queryFn: () => Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc) => rpc.listProjectSessions({projectPath})),
    queryKey: listProjectSessionsQueryKey(projectPath),
  });
}

interface UseListProjectSessionsOptions {
  projectPath: string;
}

export function useListProjectSessions(options: UseListProjectSessionsOptions) {
  const {projectPath} = options;

  return useQuery(listProjectSessionsQueryOptions(projectPath));
}
