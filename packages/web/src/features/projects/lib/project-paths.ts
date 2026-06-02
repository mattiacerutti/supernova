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
