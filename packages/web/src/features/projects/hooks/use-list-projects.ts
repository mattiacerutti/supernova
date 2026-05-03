import {useQuery} from "@tanstack/react-query";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

const listProjectsQueryKey = ["pi", "projects", "list"] as const;

export function useListProjects() {
  const client = useAgentRpcClient();

  return useQuery({
    queryFn: () => client.projects.list(),
    queryKey: listProjectsQueryKey,
  });
}
