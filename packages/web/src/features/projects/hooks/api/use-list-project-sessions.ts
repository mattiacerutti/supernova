import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";

export function listProjectSessionsQueryKey(projectPath: string) {
  return ["agent", "project", "sessions", projectPath] as const;
}

interface IUseListProjectSessionsOptions {
  cursor?: string;
  enabled: boolean;
  limit?: number;
  projectPath: string;
}

export function useListProjectSessions(options: IUseListProjectSessionsOptions) {
  const {cursor, enabled, limit, projectPath} = options;

  return useQuery(
    eq.queryOptions({
      enabled: enabled && projectPath.length > 0,
      placeholderData: (previousData) => previousData,
      queryFn: () =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.listProjectSessions({cursor, limit, projectPath});
        }),
      queryKey: [...listProjectSessionsQueryKey(projectPath), {cursor, limit}] as const,
    })
  );
}
