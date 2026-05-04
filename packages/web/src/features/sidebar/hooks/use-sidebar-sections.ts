import {useSidebarSectionsStore} from "@/features/sidebar/stores/sidebar-store";

export function useSidebarSections() {
  const expandedProjects = useSidebarSectionsStore((state) => state.expandedProjects);
  const isPinnedCollapsed = useSidebarSectionsStore((state) => state.isPinnedCollapsed);
  const isProjectsCollapsed = useSidebarSectionsStore((state) => state.isProjectsCollapsed);
  const expandProject = useSidebarSectionsStore((state) => state.expandProject);
  const togglePinnedCollapsed = useSidebarSectionsStore((state) => state.togglePinnedCollapsed);
  const toggleProject = useSidebarSectionsStore((state) => state.toggleProject);
  const toggleProjectsCollapsed = useSidebarSectionsStore((state) => state.toggleProjectsCollapsed);

  return {
    expandProject,
    expandedProjects,
    isPinnedCollapsed,
    isProjectsCollapsed,
    togglePinnedCollapsed,
    toggleProject,
    toggleProjectsCollapsed,
  };
}
