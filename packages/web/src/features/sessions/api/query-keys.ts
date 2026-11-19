export const sessionKeys = {
  all: ["sessions"] as const,
  searches: () => [...sessionKeys.all, "search"] as const,
  search: (text: string, projectPaths: readonly string[]) => [...sessionKeys.searches(), text, projectPaths] as const,
  models: (projectPath: string) => [...sessionKeys.all, "models", projectPath] as const,
  composerResources: (projectPath: string) => [...sessionKeys.all, "composer-resources", projectPath] as const,
  branches: (projectPath: string) => [...sessionKeys.all, "branches", projectPath] as const,
  composerFiles: (projectPath: string, query: string | null) => [...sessionKeys.all, "composer-files", projectPath, query] as const,
};
