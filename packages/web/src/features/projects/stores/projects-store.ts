import {create} from "zustand";
import {persist} from "zustand/middleware";

const PROJECTS_STORAGE_KEY = "supernova-projects";

export interface StoredProject {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly addedAt: string;
  readonly pinned?: boolean;
  readonly pinnedSessionIds?: string[];
}

interface ProjectsState {
  readonly projects: StoredProject[];
  readonly addProject: (projectPath: string) => StoredProject | undefined;
  readonly removeProject: (projectId: string) => void;
  readonly renameProject: (projectId: string, name: string) => void;
  readonly toggleProjectPinned: (projectId: string) => void;
  readonly toggleSessionPinned: (projectId: string, sessionId: string) => void;
}

function normalizeProjectPath(projectPath: string): string {
  return projectPath.trim().replace(/[\\/]+$/, "");
}

function toProjectId(projectPath: string): string {
  return btoa(encodeURIComponent(projectPath)).replaceAll("=", "");
}

function toProjectName(projectPath: string): string {
  const segments = projectPath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? projectPath;
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set, get) => ({
      projects: [],
      addProject: (projectPath) => {
        const normalizedPath = normalizeProjectPath(projectPath);
        if (normalizedPath.length === 0) return undefined;

        const existingProject = get().projects.find((project) => project.path === normalizedPath);
        if (existingProject) return existingProject;

        const project: StoredProject = {
          id: toProjectId(normalizedPath),
          name: toProjectName(normalizedPath),
          path: normalizedPath,
          addedAt: new Date().toISOString(),
        };

        set((state) => ({projects: [...state.projects, project]}));
        return project;
      },
      removeProject: (projectId) => {
        set((state) => ({projects: state.projects.filter((project) => project.id !== projectId)}));
      },
      renameProject: (projectId, name) => {
        const trimmedName = name.trim();
        if (trimmedName.length === 0) return;

        set((state) => ({
          projects: state.projects.map((project) => (project.id === projectId ? {...project, name: trimmedName} : project)),
        }));
      },
      toggleSessionPinned: (projectId, sessionId) => {
        set((state) => ({
          projects: state.projects.map((project) => {
            if (project.id !== projectId) return project;

            const pinnedSessionIds = project.pinnedSessionIds ?? [];
            const nextPinnedSessionIds = pinnedSessionIds.includes(sessionId)
              ? pinnedSessionIds.filter((pinnedSessionId) => pinnedSessionId !== sessionId)
              : [...pinnedSessionIds, sessionId];
            return {...project, pinnedSessionIds: nextPinnedSessionIds};
          }),
        }));
      },
      toggleProjectPinned: (projectId) => {
        set((state) => ({
          projects: state.projects.map((project) => (project.id === projectId ? {...project, pinned: project.pinned !== true} : project)),
        }));
      },
    }),
    {
      name: PROJECTS_STORAGE_KEY,
      partialize: (state) => ({projects: state.projects}),
    }
  )
);
