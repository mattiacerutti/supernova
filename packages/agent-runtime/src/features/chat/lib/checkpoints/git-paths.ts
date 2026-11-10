import {isAbsolute, relative, sep} from "node:path";

export function slashPath(value: string): string {
  return value.split(sep).join("/");
}

export function isWithin(root: string, path: string): boolean {
  const relativePath = relative(root, path);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

export function validateGitPath(path: string): void {
  if (path.length === 0 || isAbsolute(path) || path.includes("\0")) throw new Error("Checkpoint contains an unsafe repository path.");
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) throw new Error("Checkpoint contains an unsafe repository path.");
}

export function isExcludedPath(path: string, excludedRoots: readonly string[]): boolean {
  return excludedRoots.some((root) => path === root || path.startsWith(`${root}/`));
}

/** Reduces paths to their shallowest entries, so removing a directory is never followed by removing its children. */
export function topmostPaths(paths: readonly string[]): readonly string[] {
  const ordered = [...new Set(paths)].sort((left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right));
  return ordered.filter((path, index) => !ordered.slice(0, index).some((parent) => path.startsWith(`${parent}/`)));
}
