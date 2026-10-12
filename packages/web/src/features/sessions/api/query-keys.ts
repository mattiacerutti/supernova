/** Query keys for session data. Parent keys prefix child keys so invalidation can target a whole family. */
export const sessionKeys = {
  all: ["sessions"] as const,
  lists: () => [...sessionKeys.all, "list"] as const,
  list: (projectPath: string) => [...sessionKeys.lists(), projectPath] as const,
  searches: () => [...sessionKeys.all, "search"] as const,
  search: (query: string, projectPaths: readonly string[]) => [...sessionKeys.searches(), query, projectPaths] as const,
  models: (projectPath: string) => [...sessionKeys.all, "models", projectPath] as const,
  composerResources: (projectPath: string) => [...sessionKeys.all, "composer-resources", projectPath] as const,
  branches: (projectPath: string) => [...sessionKeys.all, "branches", projectPath] as const,
  composerFiles: (projectPath: string, query: string | null) => [...sessionKeys.all, "composer-files", projectPath, query] as const,
};
