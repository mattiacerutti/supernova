import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {queryOptions, useQuery, useQueryClient} from "@tanstack/react-query";
import {showToast} from "@/lib/toast";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {useRuntime} from "@/runtime/hooks/use-runtime";

export function useSessionModels(projectPath: string) {
  const runtime = useRuntime();
  const queryClient = useQueryClient();
  const queryKey = sessionKeys.models(projectPath);

  return useQuery(
    queryOptions({
      queryFn: () =>
        runtime.sessions.listModels({projectPath}, context).catch((error: unknown) => {
          showToast("Unable to load models", "Check your settings and extensions, then retry.", {
            id: `models-load-error:${projectPath}`,
            actionProps: {children: "Retry", onClick: () => void queryClient.invalidateQueries({queryKey})},
          });
          throw error;
        }),
      queryKey,
      retry: false,
      refetchOnWindowFocus: false,
    })
  );
}
