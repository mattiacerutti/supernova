import {existsSync} from "node:fs";
import {readdir, stat} from "node:fs/promises";
import {homedir} from "node:os";
import {basename, dirname, isAbsolute, join} from "node:path";
import {Effect} from "effect";
import {AgentFolderSuggestionsListError, type IAgentFolderSuggestion} from "@pi-desktop/contracts/folders";
import {expandHomePath, resolveFolderPath} from "@pi-desktop/agent-runtime/implementations/filesystem/folders/lib/folder-paths";

const MAX_SUGGESTIONS = 200;

interface IParsedFolderQuery {
  readonly baseDir: string;
  readonly searchTerm: string;
}

function parseFolderQuery(query: string): IParsedFolderQuery {
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

async function listLocalFolderSuggestions(query: string): Promise<IAgentFolderSuggestion[]> {
  const parsedQuery = parseFolderQuery(query);
  const childDirectories = await readChildDirectories(parsedQuery.baseDir);

  return childDirectories
    .filter((folderPath) => {
      if (parsedQuery.searchTerm.length === 0) return true;
      return basename(folderPath).toLowerCase().includes(parsedQuery.searchTerm.toLowerCase());
    })
    .toSorted((left, right) => left.localeCompare(right))
    .slice(0, MAX_SUGGESTIONS)
    .map((folderPath) => ({name: basename(folderPath), path: folderPath}));
}
export function listFolderSuggestions(query: string) {
  return Effect.tryPromise({
    try: async () => {
      const queryPath = query.trim().length > 0 ? resolveFolderPath(query) : homedir();

      return {
        homePath: homedir(),
        query,
        queryPath,
        queryPathType: await readFolderPathType(queryPath),
        suggestions: await listLocalFolderSuggestions(query),
      };
    },
    catch: (cause) =>
      new AgentFolderSuggestionsListError({
        cause,
        message: cause instanceof Error ? cause.message : "Failed to list folder suggestions.",
      }),
  });
}
