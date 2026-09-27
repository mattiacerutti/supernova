import {realpath} from "node:fs/promises";
import {resolve, sep} from "node:path";

/**
 * Resolves a path inside the project and returns it only when it is still inside after symlinks are
 * followed, so neither `..` segments nor a symlinked directory can reach the rest of the filesystem.
 * Undefined means the path is missing or escapes.
 */
export async function pathInProject(projectPath: string, relativePath: string): Promise<string | undefined> {
  const [root, target] = await Promise.all([realpath(projectPath).catch(() => undefined), realpath(resolve(projectPath, relativePath)).catch(() => undefined)]);
  if (!root || !target) return undefined;
  return target === root || target.startsWith(root + sep) ? target : undefined;
}
