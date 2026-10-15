export const projectKeys = {
  all: ["projects"] as const,
  folderSuggestions: () => [...projectKeys.all, "folder-suggestions"] as const,
  folderSuggestion: (query: string) => [...projectKeys.folderSuggestions(), query] as const,
};
