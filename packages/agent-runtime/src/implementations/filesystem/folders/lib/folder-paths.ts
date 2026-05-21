import {homedir} from "node:os";
import {join, resolve, sep} from "node:path";

/** Expands a leading home-directory marker in a folder path. */
export function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith(`~${sep}`) || value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

/** Resolves user-provided folder input into an absolute filesystem path. */
export function resolveFolderPath(path: string): string {
  return resolve(expandHomePath(path.trim()));
}
