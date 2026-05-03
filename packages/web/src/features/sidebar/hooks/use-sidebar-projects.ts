import {useState} from "react";
import type {IAgentProjectSummary} from "@pi-desktop/contracts";
import {sidebarActions} from "@/features/sidebar/stores/sidebar-store";
import type {ISidebarProject} from "@/features/sidebar/types/sidebar";
import {useListProjects} from "@/features/projects/hooks/use-list-projects";

const initialExpandedProjectIds = new Set<string>();

function formatUpdatedAt(value: string): string {
  const updatedAt = new Date(value).getTime();
  if (Number.isNaN(updatedAt)) return "";

  const elapsedMs = Date.now() - updatedAt;
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 60) return "Today";

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return "Today";

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) return `${elapsedDays}d`;

  const elapsedMonths = Math.floor(elapsedDays / 30);
  return `${elapsedMonths}mo`;
}

function toSidebarProject(project: IAgentProjectSummary): ISidebarProject {
  return {
    chats: project.chats.map((chat) => ({
      id: chat.id,
      title: chat.title,
      updatedAt: formatUpdatedAt(chat.updatedAt),
    })),
    id: project.id,
    name: project.name,
  };
}

export function useSidebarProjects() {
  const [expandedProjectIds, setExpandedProjectIds] = useState(initialExpandedProjectIds);
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const listProjectsQuery = useListProjects();
  const projects = listProjectsQuery.data?.projects.map(toSidebarProject) ?? [];

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
    error: listProjectsQuery.error,
    expandedProjectIds,
    isLoading: listProjectsQuery.isLoading,
    projects,
    projectsCollapsed,
    toggleProject,
    toggleProjectsCollapsed,
  };
}
