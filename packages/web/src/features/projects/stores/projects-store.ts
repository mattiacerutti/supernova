import {create} from "zustand";
import {persist} from "zustand/middleware";

const PROJECTS_STORAGE_KEY = "pi-desktop-projects";
const LEGACY_PINNED_SESSION_IDS_KEY = ["pinned", "C", "hat", "Ids"].join("");

export interface IStoredProject {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly addedAt: string;
  readonly pinned?: boolean;
  readonly pinnedSessionIds?: string[];
}

interface IProjectsState {
  readonly projects: IStoredProject[];
  readonly addProject: (projectPath: string) => IStoredProject | undefined;
  readonly removeProject: (projectId: string) => void;
  readonly renameProject: (projectId: string, name: string) => void;
  readonly toggleProjectPinned: (projectId: string) => void;
  readonly toggleSessionPinned: (projectId: string, sessionId: string) => void;
}

interface IPersistedProjectsState {
  readonly projects?: unknown;
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

function migrateStoredProject(project: unknown): IStoredProject | undefined {
  if (typeof project !== "object" || project === null) return undefined;

  const storedProject = project as Record<string, unknown>;
  if (typeof storedProject.id !== "string" || typeof storedProject.name !== "string" || typeof storedProject.path !== "string" || typeof storedProject.addedAt !== "string") {
    return undefined;
  }

  const legacyPinnedSessionIds = storedProject[LEGACY_PINNED_SESSION_IDS_KEY];
  const pinnedSessionIds = Array.isArray(storedProject.pinnedSessionIds)
    ? storedProject.pinnedSessionIds.filter((sessionId): sessionId is string => typeof sessionId === "string")
    : Array.isArray(legacyPinnedSessionIds)
      ? legacyPinnedSessionIds.filter((sessionId): sessionId is string => typeof sessionId === "string")
      : undefined;

  return {
    addedAt: storedProject.addedAt,
    id: storedProject.id,
    name: storedProject.name,
    path: storedProject.path,
    pinned: typeof storedProject.pinned === "boolean" ? storedProject.pinned : undefined,
    pinnedSessionIds,
  };
}

function migrateProjectsState(state: unknown): IPersistedProjectsState {
  if (typeof state !== "object" || state === null) return {projects: []};

  const projects = (state as IPersistedProjectsState).projects;
  if (!Array.isArray(projects)) return {projects: []};

  return {projects: projects.map(migrateStoredProject).filter((project): project is IStoredProject => project !== undefined)};
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
      migrate: migrateProjectsState,
      name: PROJECTS_STORAGE_KEY,
      partialize: (state) => ({projects: state.projects}),
      version: 1,
    }
  )
);
