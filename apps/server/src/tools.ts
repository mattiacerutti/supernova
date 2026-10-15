import {existsSync} from "node:fs";
import {delimiter, dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const serverDir = dirname(fileURLToPath(import.meta.url));
const bundledToolsDir = join(serverDir, "tools");

export function registerBundledToolsPath(): void {
  if (!existsSync(bundledToolsDir)) return;

  const path = process.env.PATH ?? "";
  process.env.PATH = path ? `${bundledToolsDir}${delimiter}${path}` : bundledToolsDir;
}
