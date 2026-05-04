import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";

export function listProjectSessionsQueryKey(projectPath: string) {
  return ["agent", "project", "sessions", projectPath] as const;
}

interface IUseListProjectSessionsOptions {
  enabled: boolean;
  projectPath: string;
}

export function useListProjectSessions(options: IUseListProjectSessionsOptions) {
  const {enabled, projectPath} = options;

  return useQuery(
    eq.queryOptions({
      enabled: enabled && projectPath.length > 0,
      queryFn: () =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          return yield* rpc.listProjectSessions({projectPath});
        }),
      queryKey: listProjectSessionsQueryKey(projectPath),
    })
  );
}
