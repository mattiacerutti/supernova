import {useState} from "react";

const initialExpandedProjects = new Set<string>();

export function useSidebarProjectSection() {
  const [expandedProjects, setExpandedProjects] = useState(initialExpandedProjects);
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(false);

  const expandProject = (projectId: string): void => {
    setExpandedProjects((currentProjectIds) => new Set(currentProjectIds).add(projectId));
  };

  const toggleProject = (projectId: string): void => {
    setExpandedProjects((currentProjects) => {
      const nextProjects = new Set(currentProjects);

      if (nextProjects.has(projectId)) {
        nextProjects.delete(projectId);
        return nextProjects;
      }

      nextProjects.add(projectId);
      return nextProjects;
    });
  };

  const toggleProjectsCollapsed = (): void => {
    setIsProjectsCollapsed((collapsed) => !collapsed);
  };

  return {
    expandProject,
    expandedProjects,
    isProjectsCollapsed,
    toggleProject,
    toggleProjectsCollapsed,
  };
}
