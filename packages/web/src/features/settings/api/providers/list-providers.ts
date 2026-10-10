import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {queryOptions, useQuery} from "@tanstack/react-query";
import {settingsKeys} from "@/features/settings/api/query-keys";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

export function useListProviders() {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      queryFn: () => unwrap(runtime.providers.list(BACKGROUND_CONTEXT)),
      queryKey: settingsKeys.providers(),
    })
  );
}
