import {queryOptions, useQuery} from "@tanstack/react-query";

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
