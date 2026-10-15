import {homedir} from "node:os";
import {join, resolve} from "node:path";

export function normalizePathForDisplay(path: string): string {
  return path.replace(/\\/g, "/");
}

export function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return join(homedir(), value.slice(2));
  return value;
}

export function resolveFolderPath(path: string): string {
  return resolve(expandHomePath(path.trim()));
}
