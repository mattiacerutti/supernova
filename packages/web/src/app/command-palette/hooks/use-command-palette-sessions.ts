import type {CommandPaletteSessionSearch} from "@/features/command-palette/types/command-palette";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {useSearchSessions} from "@/features/sessions/api/sidebar/search-sessions";

/** Sessions across every project whose title matches `query`, newest first, with each session's project name. */
export function useCommandPaletteSessions(query: string): CommandPaletteSessionSearch {
  const projects = useProjectsStore((state) => state.projects);
  const projectNamesByPath = new Map(projects.map((project) => [project.path, project.name]));
  const search = useSearchSessions(
    query,
    projects.map((project) => project.path)
  );

  return {
    ...search,
    sessions: search.sessions.map((session) => ({...session, projectName: projectNamesByPath.get(session.projectPath) ?? session.projectPath})),
  };
}
