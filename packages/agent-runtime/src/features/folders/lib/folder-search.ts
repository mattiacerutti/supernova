import {existsSync} from "node:fs";
import {readdir, stat} from "node:fs/promises";
import {homedir} from "node:os";
import {basename, dirname, isAbsolute, join} from "node:path";
import type {FolderSuggestion} from "@supernova/contracts/folders/schemas";
import {expandHomePath, normalizePathForDisplay, resolveFolderPath} from "@supernova/agent-runtime/features/folders/lib/paths";

const MAX_SUGGESTIONS = 200;

interface ParsedFolderQuery {
  readonly baseDir: string;
  readonly searchTerm: string;
}

/** Splits user folder input into a directory to scan and a child search term. */
function parseFolderQuery(query: string): ParsedFolderQuery {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return {baseDir: homedir(), searchTerm: ""};
  }

  const expandedQuery = expandHomePath(trimmedQuery);
  const hasPathSeparator = expandedQuery.includes("/") || expandedQuery.includes("\\");
  if (!hasPathSeparator && !isAbsolute(expandedQuery)) {
    return {baseDir: homedir(), searchTerm: expandedQuery};
  }

  const resolvedQuery = resolveFolderPath(expandedQuery);
  const endsWithSeparator = trimmedQuery.endsWith("/") || trimmedQuery.endsWith("\\");
  if (endsWithSeparator) {
    return {baseDir: resolvedQuery, searchTerm: ""};
  }

  return {baseDir: dirname(resolvedQuery), searchTerm: basename(resolvedQuery)};
}

async function readChildDirectories(parentPath: string): Promise<string[]> {
  const entries = await readdir(parentPath, {withFileTypes: true}).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(parentPath, entry.name));
}

export async function readFolderPathType(path: string): Promise<"directory" | "file" | "missing"> {
  if (!existsSync(path)) return "missing";

  const folderStat = await stat(path);
  return folderStat.isDirectory() ? "directory" : "file";
}

/** Reads local child directories that match the folder-picker query. */
export async function searchFolders(query: string): Promise<FolderSuggestion[]> {
  const parsedQuery = parseFolderQuery(query);
  const childDirectories = await readChildDirectories(parsedQuery.baseDir);

  const showHidden = parsedQuery.searchTerm.length === 0 || parsedQuery.searchTerm.startsWith(".");
  const lowerSearchTerm = parsedQuery.searchTerm.toLowerCase();

  return childDirectories
    .filter((folderPath) => {
      const folderName = basename(folderPath);
      return folderName.toLowerCase().startsWith(lowerSearchTerm) && (showHidden || !folderName.startsWith("."));
    })
    .toSorted((left, right) => left.localeCompare(right))
    .slice(0, MAX_SUGGESTIONS)
    .map((folderPath) => ({name: basename(folderPath), path: normalizePathForDisplay(folderPath)}));
}
