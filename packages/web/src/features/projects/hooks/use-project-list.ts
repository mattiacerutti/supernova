import {useProjectsStore} from "@/features/projects/stores/projects-store";
import type {ProjectListProject} from "@/features/projects/types/project-list";

export function useProjectList(): ProjectListProject[] {
  const storedProjects = useProjectsStore((state) => state.projects);

  return storedProjects.map((project) => ({
    id: project.id,
    name: project.name,
    path: project.path,
    pinned: project.pinned === true,
    pinnedSessionIds: project.pinnedSessionIds ?? [],
  }));
}
