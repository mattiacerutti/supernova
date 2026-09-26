/** Converts Windows separators so every path comparison is slash-based. */
export function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Normalizes project paths for browser storage, query keys, and UI comparisons. */
export function normalizeProjectPath(projectPath: string): string {
  const normalized = normalizePathSeparators(projectPath.trim());
  if (normalized === "/" || /^[A-Za-z]:\/$/.test(normalized)) return normalized;

  const trimmed = normalized.replace(/\/+$/g, "");
  return trimmed.length > 0 ? trimmed : normalized;
}

/** Stable, URL-safe id for a project path. */
export function projectIdFromPath(projectPath: string): string {
  return btoa(encodeURIComponent(normalizeProjectPath(projectPath))).replaceAll("=", "");
}

/** Returns the display name for a normalized or native project path. */
export function projectNameFromPath(projectPath: string): string {
  const normalized = normalizeProjectPath(projectPath);
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
}
