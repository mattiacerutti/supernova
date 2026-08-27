import {isAbsolute, relative, sep} from "node:path";

/** Converts a platform path into the forward-slash form Git uses. */
export function slashPath(value: string): string {
  return value.split(sep).join("/");
}

/** Returns whether a resolved path is the root itself or lives inside it. */
export function isWithin(root: string, path: string): boolean {
  const relativePath = relative(root, path);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

/** Rejects repository-relative paths that could escape their repository or confuse path handling. */
export function validateGitPath(path: string): void {
  if (path.length === 0 || isAbsolute(path) || path.includes("\0")) throw new Error("Checkpoint contains an unsafe repository path.");
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) throw new Error("Checkpoint contains an unsafe repository path.");
}

/** Returns whether a repository-relative path belongs to one of the excluded child repository roots. */
export function isExcludedPath(path: string, excludedRoots: readonly string[]): boolean {
  return excludedRoots.some((root) => path === root || path.startsWith(`${root}/`));
}

/** Reduces paths to their shallowest entries, so removing a directory is never followed by removing its children. */
export function topmostPaths(paths: readonly string[]): readonly string[] {
  const ordered = [...new Set(paths)].sort((left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right));
  return ordered.filter((path, index) => !ordered.slice(0, index).some((parent) => path.startsWith(`${parent}/`)));
}
