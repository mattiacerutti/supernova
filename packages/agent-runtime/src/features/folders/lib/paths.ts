import {homedir} from "node:os";
import {join, resolve} from "node:path";

/** Converts filesystem paths into the app's slash-delimited transport format. */
export function normalizePathForDisplay(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Expands a leading home-directory marker in a folder path. */
export function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return join(homedir(), value.slice(2));
  return value;
}

/** Resolves user-provided folder input into an absolute filesystem path. */
export function resolveFolderPath(path: string): string {
  return resolve(expandHomePath(path.trim()));
}
