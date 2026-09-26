/** Query keys for project and folder data. */
export const projectKeys = {
  all: ["projects"] as const,
  folderSuggestions: () => [...projectKeys.all, "folder-suggestions"] as const,
  folderSuggestion: (query: string) => [...projectKeys.folderSuggestions(), query] as const,
};
