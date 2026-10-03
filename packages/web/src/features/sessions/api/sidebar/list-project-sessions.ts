import {queryOptions, useQuery} from "@tanstack/react-query";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {unwrap} from "@/rpc/runtime-result";
import type {RuntimeClient} from "@/rpc/transport/runtime-client";
import {useRuntime} from "@/rpc/use-runtime";

export function listProjectSessionsQueryOptions(runtime: RuntimeClient, projectPath: string) {
  return queryOptions({
    enabled: projectPath.length > 0,
    placeholderData: (previousData) => previousData,
    queryFn: () => unwrap(runtime.projects.listSessions({projectPath})),
    queryKey: sessionKeys.list(projectPath),
  });
}

export function useListProjectSessions(projectPath: string) {
  const runtime = useRuntime();
  return useQuery(listProjectSessionsQueryOptions(runtime, projectPath));
}
