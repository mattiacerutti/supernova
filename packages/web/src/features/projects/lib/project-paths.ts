export interface FormattedSuggestionPath {
  readonly name: string;
  readonly parent: string;
  readonly suffix: string;
}

function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, "/");
}

function pathUsesCaseInsensitivePrefix(path: string): boolean {
  return /^[A-Za-z]:\//.test(path) || path.startsWith("//");
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  if (pathUsesCaseInsensitivePrefix(path) || pathUsesCaseInsensitivePrefix(prefix)) {
    return path.toLowerCase() === prefix.toLowerCase() || path.toLowerCase().startsWith(`${prefix.toLowerCase()}/`);
  }

  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Normalizes project paths for browser storage, query keys, and UI comparisons. */
export function normalizeProjectPath(projectPath: string): string {
  const normalized = normalizePathSeparators(projectPath.trim());
  if (normalized === "/" || /^[A-Za-z]:\/$/.test(normalized)) return normalized;

  const trimmed = normalized.replace(/\/+$/g, "");
  return trimmed.length > 0 ? trimmed : normalized;
}

/** Returns the display name for a normalized or native project path. */
export function projectNameFromPath(projectPath: string): string {
  const normalized = normalizeProjectPath(projectPath);
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
}

/** Returns whether a project path ends at a directory boundary. */
export function hasTrailingProjectPathSeparator(projectPath: string): boolean {
  return projectPath.endsWith("/") || projectPath.endsWith("\\");
}

/** Returns the directory portion used to load entries for a project path. */
export function getProjectBrowseDirectoryPath(projectPath: string): string {
  if (hasTrailingProjectPathSeparator(projectPath)) return projectPath;

  const lastSeparatorIndex = Math.max(projectPath.lastIndexOf("/"), projectPath.lastIndexOf("\\"));
  return lastSeparatorIndex < 0 ? "" : projectPath.slice(0, lastSeparatorIndex + 1);
}

/** Returns the final path segment used to filter loaded directory entries. */
export function getProjectBrowseLeafPath(projectPath: string): string {
  if (hasTrailingProjectPathSeparator(projectPath)) return "";

  const lastSeparatorIndex = Math.max(projectPath.lastIndexOf("/"), projectPath.lastIndexOf("\\"));
  return projectPath.slice(lastSeparatorIndex + 1);
}

/** Returns the parent directory path to warm before upward navigation. */
export function getProjectBrowseParentPath(projectPath: string): string | null {
  const normalized = normalizeProjectPath(projectPath);
  if (normalized === "/" || /^[A-Za-z]:\/$/.test(normalized) || normalized === "~") return null;

  const lastSeparatorIndex = normalized.lastIndexOf("/");
  if (lastSeparatorIndex < 0) return null;
  if (lastSeparatorIndex === 0) return "/";
  return `${normalized.slice(0, lastSeparatorIndex)}/`;
}

/** Resolves a typed leaf against the absolute directory returned by the server. */
export function resolveProjectBrowsePath(directoryPath: string, leafPath: string): string {
  if (leafPath.length === 0) return normalizeProjectPath(directoryPath);
  return `${normalizeProjectPath(directoryPath)}/${normalizePathSeparators(leafPath)}`;
}

/** Ensures folder autocomplete values stay slash-delimited. */
export function withTrailingProjectPathSeparator(projectPath: string): string {
  const normalized = normalizePathSeparators(projectPath);
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

/** Formats a folder suggestion into parent/name pieces for the open-project dialog. */
export function formatSuggestionPath(displayPath: string, homePath: string | undefined): FormattedSuggestionPath {
  const trimmedPath = normalizeProjectPath(displayPath);
  const normalizedHomePath = homePath ? normalizeProjectPath(homePath) : undefined;
  const displayTrimmedPath = normalizedHomePath && pathMatchesPrefix(trimmedPath, normalizedHomePath) ? `~${trimmedPath.slice(normalizedHomePath.length)}` : trimmedPath;
  const lastSlashIndex = displayTrimmedPath.lastIndexOf("/");

  if (lastSlashIndex <= 0) {
    return {name: displayTrimmedPath, parent: "", suffix: "/"};
  }

  return {
    name: displayTrimmedPath.slice(lastSlashIndex + 1),
    parent: displayTrimmedPath.slice(0, lastSlashIndex + 1),
    suffix: "/",
  };
}
