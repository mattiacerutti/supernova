import {queryOptions, usePrefetchQuery, useQuery} from "@tanstack/react-query";

// Installed editors are checked once per app run so the Open in page opens with its rows; an editor installed while the app runs appears after a restart.
function installedEditorsQueryOptions() {
  const desktopApi = window.desktopApi;
  return queryOptions({
    enabled: desktopApi !== undefined,
    gcTime: Infinity,
    queryFn: () => desktopApi?.listEditors() ?? [],
    queryKey: ["desktop", "editors"],
    staleTime: Infinity,
  });
}

export function useInstalledEditors() {
  return useQuery(installedEditorsQueryOptions());
}

export function usePrefetchInstalledEditors() {
  usePrefetchQuery(installedEditorsQueryOptions());
}
