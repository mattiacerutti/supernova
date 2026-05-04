import {useProjectsStore} from "@/features/projects/stores/projects-store";
import type {IProjectListProject} from "@/features/projects/types/project-list";

export function useProjectList(): IProjectListProject[] {
  const storedProjects = useProjectsStore((state) => state.projects);

  return storedProjects.map((project) => ({
    id: project.id,
    name: project.name,
    path: project.path,
    pinned: project.pinned === true,
    pinnedChatIds: project.pinnedChatIds ?? [],
  }));
}
