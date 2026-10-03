import {queryOptions, useQuery} from "@tanstack/react-query";
import {settingsKeys} from "@/features/settings/api/query-keys";
import {unwrap} from "@/rpc/runtime-result";
import {useRuntime} from "@/rpc/use-runtime";

export function useListProviders() {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      queryFn: () => unwrap(runtime.providers.list()),
      queryKey: settingsKeys.providers(),
    })
  );
}
