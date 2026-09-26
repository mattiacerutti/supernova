/** Query keys for workspace data. Everything sits under the project so a finished agent turn can invalidate the whole project at once. */
export const workspaceKeys = {
  all: ["workspace"] as const,
  project: (projectPath: string) => [...workspaceKeys.all, projectPath] as const,
  repositories: (projectPath: string) => [...workspaceKeys.project(projectPath), "repositories"] as const,
  files: (projectPath: string) => [...workspaceKeys.project(projectPath), "files"] as const,
  file: (projectPath: string, path: string) => [...workspaceKeys.project(projectPath), "file", path] as const,
  changes: (projectPath: string, repositoryRoot: string) => [...workspaceKeys.project(projectPath), "changes", repositoryRoot] as const,
  diff: (projectPath: string, repositoryRoot: string, path: string) => [...workspaceKeys.project(projectPath), "diff", repositoryRoot, path] as const,
};
