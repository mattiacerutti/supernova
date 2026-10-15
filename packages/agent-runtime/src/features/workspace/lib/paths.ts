import {realpath} from "node:fs/promises";
import {resolve, sep} from "node:path";

/** Checked after following symlinks, so neither `..` nor a symlinked directory can escape the project. */
export async function pathInProject(projectPath: string, relativePath: string): Promise<string | undefined> {
  const [root, target] = await Promise.all([realpath(projectPath).catch(() => undefined), realpath(resolve(projectPath, relativePath)).catch(() => undefined)]);
  if (!root || !target) return undefined;
  return target === root || target.startsWith(root + sep) ? target : undefined;
}
