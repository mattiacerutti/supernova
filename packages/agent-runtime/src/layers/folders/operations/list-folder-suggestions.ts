import {existsSync} from "node:fs";
import {readdir, stat} from "node:fs/promises";
import {homedir} from "node:os";
import {basename, dirname, isAbsolute, join} from "node:path";
import {Effect} from "effect";
import {FolderSuggestionsListError} from "@supernova/contracts/folders/procedures";
import type {FolderSuggestion} from "@supernova/contracts/folders/schemas";
import {expandHomePath, normalizePathForDisplay, resolveFolderPath} from "@supernova/agent-runtime/layers/folders/lib/folder-paths";

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
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => join(parentPath, entry.name));
}

async function readFolderPathType(path: string): Promise<"directory" | "file" | "missing"> {
  if (!existsSync(path)) return "missing";

  const folderStat = await stat(path);
  return folderStat.isDirectory() ? "directory" : "file";
}

/** Reads local child directories that match the folder-picker query. */
async function listLocalFolderSuggestions(query: string): Promise<FolderSuggestion[]> {
  const parsedQuery = parseFolderQuery(query);
  const childDirectories = await readChildDirectories(parsedQuery.baseDir);

  return childDirectories
    .filter((folderPath) => {
      if (parsedQuery.searchTerm.length === 0) return true;
      return basename(folderPath).toLowerCase().includes(parsedQuery.searchTerm.toLowerCase());
    })
    .toSorted((left, right) => left.localeCompare(right))
    .slice(0, MAX_SUGGESTIONS)
    .map((folderPath) => ({name: basename(folderPath), path: normalizePathForDisplay(folderPath)}));
}

/** Lists local folder suggestions and metadata for the folder picker. */
export function listFolderSuggestions(query: string) {
  return Effect.tryPromise({
    try: async () => {
      const queryPath = query.trim().length > 0 ? resolveFolderPath(query) : homedir();

      return {
        homePath: normalizePathForDisplay(homedir()),
        query,
        queryPath: normalizePathForDisplay(queryPath),
        queryPathType: await readFolderPathType(queryPath),
        suggestions: await listLocalFolderSuggestions(query),
      };
    },
    catch: (cause) =>
      new FolderSuggestionsListError({
        cause,
        message: cause instanceof Error ? cause.message : "Failed to list folder suggestions.",
      }),
  });
}
