import {useRef, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {listFolderSuggestionsQueryOptions, useListFolderSuggestions} from "@/features/projects/api/command-palette/list-folder-suggestions";
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

/**
 * Browses the server's folders from a typed path. The listing is keyed by the path's folder, so typing within a name
 * filters locally while entering a folder (`enter`) loads first and then moves, so the rows never empty in between.
 */
export function useFolderBrowser(options: UseFolderBrowserOptions) {
  const {recentProjectPaths} = options;
  const [path, setPath] = useState("");
  // Counts folder navigations so a listing that finishes loading after the user moved on does not take them back.
  const navigation = useRef(0);
  const queryClient = useQueryClient();
  const listingQuery = useListFolderSuggestions(getProjectBrowseDirectoryPath(path));
  const listing = listingQuery.data;
  // Until the new folder's listing arrives, the list keeps showing the previous one; it is not this folder's contents.
  const folderLoaded = listing !== undefined && !listingQuery.isPlaceholderData;
  const folders = listing ? filterFolderSuggestions(listing, getProjectBrowseLeafPath(path)) : [];
  const rows: FolderBrowserRow[] = buildFolderBrowserRows({folders, projectPath: path, recentProjectPaths: recentProjectPaths.slice(0, RECENT_PROJECT_LIMIT)});
  const resolved: ResolvedFolderPath | undefined = listing && folderLoaded && path.trim().length > 0 ? resolveFolderPath(path, listing) : undefined;

  const prefetch = (folderPath: string): Promise<unknown> => queryClient.prefetchQuery(listFolderSuggestionsQueryOptions(folderPath));

  // A highlighted folder is probably about to be entered.
  const preload = (folderPath: string): void => {
    void prefetch(withTrailingProjectPathSeparator(folderPath));
  };

  const type = (value: string): void => {
    navigation.current += 1;
    // Going up is one Backspace away, so the parent is loaded ahead.
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
    /** Set once the current folder's listing has loaded; until then the rows are the previous folder's. */
    folderLoaded,
    homePath: listing?.homePath,
    /** Set while nothing has loaded yet, so the first listing is still on its way. */
    loading: listing === undefined,
    path,
    preload,
    resolved,
    rows,
    type,
  };
}
