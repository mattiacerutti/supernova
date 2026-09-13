import type {SidebarAction} from "@/features/sidebar/types/sidebar";
import {create} from "zustand";
import {createJSONStorage, persist} from "zustand/middleware";

const SIDEBAR_SECTIONS_STORAGE_KEY = "supernova-sidebar-sections";
const EXPANDED_PROJECTS_STORAGE_VALUE_KEY = "expandedProjects";
const DEFAULT_SIDEBAR_WIDTH = 288;
export const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 480;

interface SidebarSectionsState {
  readonly expandedProjects: Set<string>;
  readonly isPinnedCollapsed: boolean;
  readonly isProjectsCollapsed: boolean;
  readonly sidebarWidth: number;
  readonly collapseAllProjects: () => void;
  readonly expandProject: (projectId: string) => void;
  readonly setSidebarWidth: (width: number, maxWidth: number) => void;
  readonly togglePinnedCollapsed: () => void;
  readonly toggleProject: (projectId: string) => void;
  readonly toggleProjectsCollapsed: () => void;
}

export const sidebarActions: SidebarAction[] = [
  {id: "new-project", icon: "folder", label: "New project"},
  {id: "search", icon: "search", label: "Search"},
];

export const useSidebarSectionsStore = create<SidebarSectionsState>()(
  persist(
    (set) => ({
      expandedProjects: new Set<string>(),
      isPinnedCollapsed: false,
      isProjectsCollapsed: false,
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      collapseAllProjects: () => {
        set({expandedProjects: new Set<string>()});
      },
      expandProject: (projectId) => {
        set((state) => {
          if (state.expandedProjects.has(projectId)) return state;
          return {expandedProjects: new Set(state.expandedProjects).add(projectId)};
        });
      },
      setSidebarWidth: (width, maxWidth) => {
        set({sidebarWidth: Math.min(Math.max(Math.round(width), MIN_SIDEBAR_WIDTH), maxWidth, MAX_SIDEBAR_WIDTH)});
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
            return new Set(value);
          }

          return value;
        },
      }),
      partialize: (state) => ({
        expandedProjects: state.expandedProjects,
        isPinnedCollapsed: state.isPinnedCollapsed,
        isProjectsCollapsed: state.isProjectsCollapsed,
        sidebarWidth: state.sidebarWidth,
      }),
    }
  )
);
