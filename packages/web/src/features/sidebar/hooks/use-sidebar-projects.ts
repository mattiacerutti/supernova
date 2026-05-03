import {useState} from "react";
import {sidebarActions, sidebarProjects} from "@/features/sidebar/stores/sidebar-store";

const initialExpandedProjectIds = new Set(["pi-desktop", "barks"]);

export function useSidebarProjects() {
  const [expandedProjectIds, setExpandedProjectIds] = useState(initialExpandedProjectIds);
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);

  const toggleProject = (projectId: string): void => {
    setExpandedProjectIds((currentProjectIds) => {
      const nextProjectIds = new Set(currentProjectIds);

      if (nextProjectIds.has(projectId)) {
        nextProjectIds.delete(projectId);
        return nextProjectIds;
      }

      nextProjectIds.add(projectId);
      return nextProjectIds;
    });
  };

  const toggleProjectsCollapsed = (): void => {
    setProjectsCollapsed((collapsed) => !collapsed);
  };

  return {
    actions: sidebarActions,
    expandedProjectIds,
    projects: sidebarProjects,
    projectsCollapsed,
    toggleProject,
    toggleProjectsCollapsed,
  };
}
