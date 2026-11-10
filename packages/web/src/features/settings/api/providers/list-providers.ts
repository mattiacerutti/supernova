import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {queryOptions, useQuery} from "@tanstack/react-query";
import {settingsKeys} from "@/features/settings/api/query-keys";
import {useRuntime} from "@/runtime/hooks/use-runtime";

export function useListProviders() {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      queryFn: () => runtime.providers.list(context),
      queryKey: settingsKeys.providers(),
    })
  );
}
