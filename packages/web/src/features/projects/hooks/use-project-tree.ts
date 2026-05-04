import {useProjectsStore} from "@/features/projects/stores/projects-store";
import type {IProjectTreeProject} from "@/features/projects/types/project-tree";

export function useProjectTree(): IProjectTreeProject[] {
  const storedProjects = useProjectsStore((state) => state.projects);

  return storedProjects.map((project) => ({
    id: project.id,
    name: project.name,
    path: project.path,
    pinned: project.pinned === true,
    pinnedChatIds: project.pinnedChatIds ?? [],
  }));
}
