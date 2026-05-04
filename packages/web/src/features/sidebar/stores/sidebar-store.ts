import type {ISidebarAction} from "@/features/sidebar/types/sidebar";
import {create} from "zustand";
import {createJSONStorage, persist} from "zustand/middleware";

const SIDEBAR_SECTIONS_STORAGE_KEY = "pi-desktop-sidebar-sections";
const EXPANDED_PROJECTS_STORAGE_VALUE_KEY = "expandedProjects";

interface ISidebarSectionsState {
  readonly expandedProjects: Set<string>;
  readonly isPinnedCollapsed: boolean;
  readonly isProjectsCollapsed: boolean;
  readonly expandProject: (projectId: string) => void;
  readonly togglePinnedCollapsed: () => void;
  readonly toggleProject: (projectId: string) => void;
  readonly toggleProjectsCollapsed: () => void;
}

export const sidebarActions: ISidebarAction[] = [
  {id: "new-project", icon: "folder", label: "New project"},
  {id: "search", icon: "search", label: "Search"},
];

export const useSidebarSectionsStore = create<ISidebarSectionsState>()(
  persist(
    (set) => ({
      expandedProjects: new Set<string>(),
      isPinnedCollapsed: false,
      isProjectsCollapsed: false,
      expandProject: (projectId) => {
        set((state) => {
          if (state.expandedProjects.has(projectId)) return state;
          return {expandedProjects: new Set(state.expandedProjects).add(projectId)};
        });
      },
      togglePinnedCollapsed: () => {
        set((state) => ({isPinnedCollapsed: !state.isPinnedCollapsed}));
      },
      toggleProject: (projectId) => {
        set((state) => {
          const expandedProjects = new Set(state.expandedProjects);

          if (expandedProjects.has(projectId)) {
            expandedProjects.delete(projectId);
            return {expandedProjects};
          }

          expandedProjects.add(projectId);
          return {expandedProjects};
        });
      },
      toggleProjectsCollapsed: () => {
        set((state) => ({isProjectsCollapsed: !state.isProjectsCollapsed}));
      },
    }),
    {
      name: SIDEBAR_SECTIONS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage, {
        replacer: (key, value) => {
          if (key === EXPANDED_PROJECTS_STORAGE_VALUE_KEY && value instanceof Set) {
            return [...value];
          }

          return value;
        },
        reviver: (key, value) => {
          if (key === EXPANDED_PROJECTS_STORAGE_VALUE_KEY && Array.isArray(value)) {
            return new Set(value.filter((projectId): projectId is string => typeof projectId === "string"));
          }

          return value;
        },
      }),
      partialize: (state) => ({
        expandedProjects: state.expandedProjects,
        isPinnedCollapsed: state.isPinnedCollapsed,
        isProjectsCollapsed: state.isProjectsCollapsed,
      }),
    }
  )
);
