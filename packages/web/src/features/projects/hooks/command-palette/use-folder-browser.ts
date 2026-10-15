import {useRef, useState} from "react";
import {useListFolderSuggestions, usePrefetchFolderSuggestions} from "@/features/projects/api/command-palette/list-folder-suggestions";
import {
  buildFolderBrowserRows,
  filterFolderSuggestions,
  getProjectBrowseDirectoryPath,
  getProjectBrowseLeafPath,
  getProjectBrowseParentPath,
  resolveFolderPath,
  withTrailingProjectPathSeparator,
} from "@/features/projects/lib/command-palette/folder-browsing";
import type {FolderBrowserRow, ResolvedFolderPath} from "@/features/projects/lib/command-palette/folder-browsing";

const RECENT_PROJECT_LIMIT = 5;

interface UseFolderBrowserOptions {
  readonly recentProjectPaths: readonly string[];
}

/** Typing within a name filters locally; entering a folder loads first, then moves, so rows never empty. */
export function useFolderBrowser(options: UseFolderBrowserOptions) {
  const {recentProjectPaths} = options;
  const [path, setPath] = useState("");
  // Counts folder navigations so a listing that finishes loading after the user moved on does not take them back.
  const navigation = useRef(0);
  const listingQuery = useListFolderSuggestions(getProjectBrowseDirectoryPath(path));
  const listing = listingQuery.data;
  // Until the new folder's listing arrives, the list keeps showing the previous one; it is not this folder's contents.
  const folderLoaded = listing !== undefined && !listingQuery.isPlaceholderData;
  const folders = listing ? filterFolderSuggestions(listing, getProjectBrowseLeafPath(path)) : [];
  const rows: FolderBrowserRow[] = buildFolderBrowserRows({folders, projectPath: path, recentProjectPaths: recentProjectPaths.slice(0, RECENT_PROJECT_LIMIT)});
  const resolved: ResolvedFolderPath | undefined = listing && folderLoaded && path.trim().length > 0 ? resolveFolderPath(path, listing) : undefined;

  const prefetch = usePrefetchFolderSuggestions();

  const preload = (folderPath: string): void => {
    void prefetch(withTrailingProjectPathSeparator(folderPath));
  };

  const type = (value: string): void => {
    navigation.current += 1;
    const parentPath = getProjectBrowseParentPath(getProjectBrowseDirectoryPath(value));
    if (parentPath) void prefetch(parentPath);
    setPath(value);
  };

  const enter = async (folderPath: string): Promise<void> => {
    const nextPath = withTrailingProjectPathSeparator(folderPath);
    const target = ++navigation.current;
    await prefetch(nextPath);
    if (target !== navigation.current) return;

    setPath(nextPath);
  };

  return {
    enter,
    error: listingQuery.isError,
    folderLoaded,
    homePath: listing?.homePath,
    loading: listing === undefined,
    path,
    preload,
    resolved,
    rows,
    type,
  };
}
