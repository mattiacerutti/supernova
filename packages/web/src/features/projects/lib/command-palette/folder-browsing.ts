import type {FolderSuggestionsListResult} from "@supernova/contracts/services/folders/procedures";
import type {CommandPaletteHeaderRow} from "@/features/command-palette/types/command-palette";
import {normalizePathSeparators, normalizeProjectPath} from "@/lib/project-paths";

export interface FormattedSuggestionPath {
  readonly name: string;
  readonly parent: string;
  readonly suffix: string;
}

/** A folder the browser lists, which can be entered or opened. */
export interface FolderBrowserFolderRow {
  readonly type: "folder";
  readonly kind: "folder" | "parent" | "recent";
  readonly path: string;
}

/** A row in the folder browser: a section heading or a folder. */
export type FolderBrowserRow = CommandPaletteHeaderRow | FolderBrowserFolderRow;

/** What the typed path points at, once the listing for its folder has loaded. */
export interface ResolvedFolderPath {
  readonly path: string;
  readonly type: FolderSuggestionsListResult["queryPathType"];
}

function pathUsesCaseInsensitivePrefix(path: string): boolean {
  return /^[A-Za-z]:\//.test(path) || path.startsWith("//");
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  if (pathUsesCaseInsensitivePrefix(path) || pathUsesCaseInsensitivePrefix(prefix)) {
    return path.toLowerCase() === prefix.toLowerCase() || path.toLowerCase().startsWith(`${prefix.toLowerCase()}/`);
  }

  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Returns whether a project path ends at a directory boundary. */
export function hasTrailingProjectPathSeparator(projectPath: string): boolean {
  return projectPath.endsWith("/") || projectPath.endsWith("\\");
}

/** Returns the directory portion used to load entries for a project path. */
export function getProjectBrowseDirectoryPath(projectPath: string): string {
  if (hasTrailingProjectPathSeparator(projectPath)) return projectPath;

  const lastSeparatorIndex = Math.max(projectPath.lastIndexOf("/"), projectPath.lastIndexOf("\\"));
  return lastSeparatorIndex < 0 ? "" : projectPath.slice(0, lastSeparatorIndex + 1);
}

/** Returns the final path segment used to filter loaded directory entries. */
export function getProjectBrowseLeafPath(projectPath: string): string {
  if (hasTrailingProjectPathSeparator(projectPath)) return "";

  const lastSeparatorIndex = Math.max(projectPath.lastIndexOf("/"), projectPath.lastIndexOf("\\"));
  return projectPath.slice(lastSeparatorIndex + 1);
}

/** Returns the parent directory path to warm before upward navigation. */
export function getProjectBrowseParentPath(projectPath: string): string | null {
  const normalized = normalizeProjectPath(projectPath);
  if (normalized === "/" || /^[A-Za-z]:\/$/.test(normalized) || normalized === "~") return null;

  const lastSeparatorIndex = normalized.lastIndexOf("/");
  if (lastSeparatorIndex < 0) return null;
  if (lastSeparatorIndex === 0) return "/";
  return `${normalized.slice(0, lastSeparatorIndex)}/`;
}

/** Resolves a typed leaf against the absolute directory returned by the server. */
export function resolveProjectBrowsePath(directoryPath: string, leafPath: string): string {
  if (leafPath.length === 0) return normalizeProjectPath(directoryPath);
  return `${normalizeProjectPath(directoryPath)}/${normalizePathSeparators(leafPath)}`;
}

/** Ensures folder autocomplete values stay slash-delimited. */
export function withTrailingProjectPathSeparator(projectPath: string): string {
  const normalized = normalizePathSeparators(projectPath);
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

/** Formats a folder suggestion into parent/name pieces for the folder browser. */
export function formatSuggestionPath(displayPath: string, homePath: string | undefined): FormattedSuggestionPath {
  const trimmedPath = normalizeProjectPath(displayPath);
  const normalizedHomePath = homePath ? normalizeProjectPath(homePath) : undefined;
  const displayTrimmedPath = normalizedHomePath && pathMatchesPrefix(trimmedPath, normalizedHomePath) ? `~${trimmedPath.slice(normalizedHomePath.length)}` : trimmedPath;
  const lastSlashIndex = displayTrimmedPath.lastIndexOf("/");

  if (lastSlashIndex <= 0) {
    return {name: displayTrimmedPath, parent: "", suffix: "/"};
  }

  return {
    name: displayTrimmedPath.slice(lastSlashIndex + 1),
    parent: displayTrimmedPath.slice(0, lastSlashIndex + 1),
    suffix: "/",
  };
}

/** The folders in `listing` that the typed leaf matches; hidden folders only when the leaf starts with a dot. */
export function filterFolderSuggestions(listing: FolderSuggestionsListResult, leafPath: string): FolderSuggestionsListResult["suggestions"] {
  const lowerLeafPath = leafPath.toLowerCase();
  const showHidden = leafPath.startsWith(".");
  return listing.suggestions.filter((folder) => folder.name.toLowerCase().startsWith(lowerLeafPath) && (showHidden || !folder.name.startsWith(".")));
}

/**
 * What the typed path points at: the listed folder itself when the path ends in a separator, a matching child when the
 * leaf names one exactly, and otherwise a folder that does not exist yet.
 */
export function resolveFolderPath(projectPath: string, listing: FolderSuggestionsListResult): ResolvedFolderPath {
  if (hasTrailingProjectPathSeparator(projectPath)) return {path: listing.queryPath, type: listing.queryPathType};

  const leafPath = getProjectBrowseLeafPath(projectPath);
  const exactFolder = listing.suggestions.find((folder) => folder.name === leafPath);
  if (exactFolder) return {path: exactFolder.path, type: "directory"};

  return {path: resolveProjectBrowsePath(listing.queryPath, leafPath), type: "missing"};
}

interface BuildFolderBrowserRowsInput {
  readonly folders: FolderSuggestionsListResult["suggestions"];
  readonly projectPath: string;
  readonly recentProjectPaths: readonly string[];
}

/** The folder browser's rows: recent projects while nothing is typed, then the parent folder and the matching folders. */
export function buildFolderBrowserRows(input: BuildFolderBrowserRowsInput): FolderBrowserRow[] {
  const {folders, projectPath, recentProjectPaths} = input;
  const rows: FolderBrowserRow[] = [];

  if (projectPath.trim().length === 0) {
    if (recentProjectPaths.length > 0) {
      rows.push({id: "recent-projects", title: "Recent projects", type: "header"});
      rows.push(...recentProjectPaths.map((path): FolderBrowserRow => ({kind: "recent", path, type: "folder"})));
    }
    rows.push({id: "open-project", title: "Open project", type: "header"});
  }

  const parentPath = getProjectBrowseParentPath(getProjectBrowseDirectoryPath(projectPath));
  if (parentPath) rows.push({kind: "parent", path: parentPath, type: "folder"});
  rows.push(...folders.map((folder): FolderBrowserRow => ({kind: "folder", path: folder.path, type: "folder"})));

  return rows;
}
