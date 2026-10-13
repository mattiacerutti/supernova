import {queryOptions, useQuery} from "@tanstack/react-query";

/**
 * The editors installed on the desktop app's machine; never loaded in the browser, which cannot reach the local
 * machine. Refetched when the window regains focus, so an editor installed meanwhile appears without a restart.
 */
export function useInstalledEditors() {
  const desktopApi = window.desktopApi;
  return useQuery(
    queryOptions({
      enabled: desktopApi !== undefined,
      queryFn: () => desktopApi?.listEditors() ?? [],
      queryKey: ["desktop", "editors"],
    })
  );
}
