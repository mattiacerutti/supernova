import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {queryOptions, useQueries, useQuery} from "@tanstack/react-query";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {projectSessions} from "@/features/sessions/lib/session-view";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {unwrap} from "@/runtime/runtime-result";
import type {RuntimeClient} from "@/runtime/transport/runtime-client";
import {useRuntime} from "@/runtime/use-runtime";

function listProjectSessionsQueryOptions(runtime: RuntimeClient, projectPath: string) {
  return queryOptions({
    enabled: projectPath.length > 0,
    placeholderData: (previousData) => previousData,
    queryFn: () => unwrap(runtime.projects.listSessions({projectPath}, BACKGROUND_CONTEXT)),
    queryKey: sessionKeys.list(projectPath),
  });
}

/** A project's sessions as the sidebar lists them: read once, then kept current by what the runtime reports. */
export function useListProjectSessions(projectPath: string) {
  const query = useQuery(listProjectSessionsQueryOptions(useRuntime(), projectPath));
  const entries = useSessionsStore((state) => state.entries);
  const optimism = useSessionsStore((state) => state.optimism);
  const sessions = query.data && projectSessions({entries, listed: query.data.sessions, optimism, projectPath});
  return {...query, sessions};
}

/** The sessions of several projects, each as the sidebar lists it; for searching across projects. */
export function useListProjectsSessions(projectPaths: readonly string[]) {
  const runtime = useRuntime();
  const queries = useQueries({queries: projectPaths.map((projectPath) => listProjectSessionsQueryOptions(runtime, projectPath))});
  const entries = useSessionsStore((state) => state.entries);
  const optimism = useSessionsStore((state) => state.optimism);
  return projectPaths.map((projectPath, index) => {
    const listed = queries[index]?.data?.sessions;
    return {projectPath, sessions: listed ? projectSessions({entries, listed, optimism, projectPath}) : []};
  });
}
