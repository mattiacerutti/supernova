import {create} from "zustand";
import {persist} from "zustand/middleware";
import type {Project} from "@/features/projects/types/project";
import {normalizeProjectPath, projectIdFromPath, projectNameFromPath} from "@/lib/project-paths";

const PROJECTS_STORAGE_KEY = "supernova-projects";

interface ProjectsState {
  readonly projects: readonly Project[];
  readonly addProject: (projectPath: string) => Project | undefined;
  readonly removeProject: (projectId: string) => void;
  readonly renameProject: (projectId: string, name: string) => void;
  readonly reorderProject: (projectId: string, targetProjectId: string) => void;
  readonly toggleProjectPinned: (projectId: string) => void;
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

        const project: Project = {
          id: projectIdFromPath(normalizedPath),
          name: projectNameFromPath(normalizedPath),
          path: normalizedPath,
          addedAt: new Date().toISOString(),
          pinned: false,
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
      reorderProject: (projectId, targetProjectId) => {
        set((state) => {
          const movedProject = state.projects.find((project) => project.id === projectId);
          const toIndex = state.projects.findIndex((project) => project.id === targetProjectId);
          if (!movedProject || toIndex === -1 || projectId === targetProjectId) return state;

          const projects = state.projects.filter((project) => project.id !== projectId);
          projects.splice(toIndex, 0, movedProject);
          return {projects};
        });
      },
      toggleProjectPinned: (projectId) => {
        set((state) => ({
          projects: state.projects.map((project) => (project.id === projectId ? {...project, pinned: !project.pinned} : project)),
        }));
      },
    }),
    {
      name: PROJECTS_STORAGE_KEY,
      // Earlier versions stored `pinned` as optional and kept session pins here; session pins now live on the server.
      merge: (persisted, current) => ({
        ...current,
        projects: ((persisted as Partial<ProjectsState> | undefined)?.projects ?? []).map((project) => ({
          addedAt: project.addedAt,
          id: project.id,
          name: project.name,
          path: project.path,
          pinned: project.pinned ?? false,
        })),
      }),
      partialize: (state) => ({projects: state.projects}),
    }
  )
);
