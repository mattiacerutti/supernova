export function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, "/");
}

export function normalizeProjectPath(projectPath: string): string {
  const normalized = normalizePathSeparators(projectPath.trim());
  if (normalized === "/" || /^[A-Za-z]:\/$/.test(normalized)) return normalized;

  const trimmed = normalized.replace(/\/+$/g, "");
  return trimmed.length > 0 ? trimmed : normalized;
}

export function projectIdFromPath(projectPath: string): string {
  return btoa(encodeURIComponent(normalizeProjectPath(projectPath))).replaceAll("=", "");
}

export function projectNameFromPath(projectPath: string): string {
  const normalized = normalizeProjectPath(projectPath);
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
}
