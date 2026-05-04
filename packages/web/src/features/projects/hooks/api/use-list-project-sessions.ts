import {useQuery} from "@tanstack/react-query";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

export function listProjectSessionsQueryKey(projectPath: string) {
  return ["agent", "project", "sessions", projectPath] as const;
}

interface IUseListProjectSessionsOptions {
  enabled: boolean;
  projectPath: string;
}

export function useListProjectSessions(options: IUseListProjectSessionsOptions) {
  const {enabled, projectPath} = options;
  const client = useAgentRpcClient();

  return useQuery({
    enabled: enabled && projectPath.length > 0,
    queryFn: () => client.run((rpc) => rpc.projectSessionsList({projectPath})),
    queryKey: listProjectSessionsQueryKey(projectPath),
  });
}
