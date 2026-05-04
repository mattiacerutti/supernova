import {create} from "zustand";
import {persist} from "zustand/middleware";

const PROJECTS_STORAGE_KEY = "pi-desktop-projects";

export interface IStoredProject {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly addedAt: string;
}

interface IProjectsState {
  readonly projects: IStoredProject[];
  readonly addProject: (projectPath: string) => IStoredProject | undefined;
  readonly removeProject: (projectId: string) => void;
  readonly renameProject: (projectId: string, name: string) => void;
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

export const useProjectsStore = create<IProjectsState>()(
  persist(
    (set, get) => ({
      projects: [],
      addProject: (projectPath) => {
        const normalizedPath = normalizeProjectPath(projectPath);
        if (normalizedPath.length === 0) return undefined;

        const existingProject = get().projects.find((project) => project.path === normalizedPath);
        if (existingProject) return existingProject;

        const project: IStoredProject = {
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
    }),
    {
      name: PROJECTS_STORAGE_KEY,
      partialize: (state) => ({projects: state.projects}),
    }
  )
);
