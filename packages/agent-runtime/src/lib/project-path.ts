import {homedir} from "node:os";
import {join, resolve, sep} from "node:path";

export function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || (process.platform === "win32" && value.startsWith("~\\"))) return join(homedir(), value.slice(2));
  return value;
}

/** Resolve lexically, like Pi's session lookup, but serialize Windows separators consistently for browser clients. */
export function resolveProjectPath(value: string): string {
  // Historical projects can be missing; realpath would also merge intentionally distinct symlink paths.
  return resolve(expandHomePath(value)).split(sep).join("/");
}
