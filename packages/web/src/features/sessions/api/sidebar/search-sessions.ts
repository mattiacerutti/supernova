import {useQueries} from "@tanstack/react-query";
import {listProjectSessionsQueryOptions} from "@/features/sessions/api/sidebar/list-project-sessions";

/**
 * Sessions across `projectPaths` whose title contains `query`, newest first, a page at a time.
 *
 * TODO(harness-v2): waiting for the Pi durable refactor to wire this to the server's paged `projects.searchSessions`.
 * Until then every project's session list is read and filtered here, so there is a single page and `loadMore` does
 * nothing. The result shape already matches the paged search, so callers stay as they are; when it lands, debounce the
 * query before it reaches the server (the old search dialog waited 150 ms) and keep the previous results while the
 * next query loads.
 */
export function useSearchSessions(query: string, projectPaths: readonly string[]) {
  const projectSessionQueries = useQueries({queries: projectPaths.map((projectPath) => listProjectSessionsQueryOptions(projectPath))});
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sessions = projectSessionQueries
    .flatMap((projectSessionsQuery) => {
      const result = projectSessionsQuery.data;
      return result ? result.sessions.map((session) => ({...session, projectPath: result.projectPath})) : [];
    })
    .filter((session) => session.title.toLocaleLowerCase().includes(normalizedQuery))
    .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  return {
    sessions,
    isPending: projectSessionQueries.some((projectSessionsQuery) => projectSessionsQuery.isPending),
    hasMore: false,
    loadMore: () => {},
  };
}
