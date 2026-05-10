import {readdir} from "node:fs/promises";
import {homedir} from "node:os";
import {basename, dirname, isAbsolute, join, resolve, sep} from "node:path";
import {Effect} from "effect";
import {AgentFolderSuggestionsListError, type IAgentFolderSuggestion} from "@pi-desktop/contracts/folders";

const MAX_SUGGESTIONS = 200;

interface IParsedFolderQuery {
  readonly baseDir: string;
  readonly searchTerm: string;
}

function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith(`~${sep}`) || value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
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

  const resolvedQuery = resolve(expandedQuery);
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
    try: async () => ({
      homePath: homedir(),
      query,
      suggestions: await listLocalFolderSuggestions(query),
    }),
    catch: (cause) =>
      new AgentFolderSuggestionsListError({
        cause,
        message: cause instanceof Error ? cause.message : "Failed to list folder suggestions.",
      }),
  });
}
