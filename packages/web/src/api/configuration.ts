import {queryOptions, useQuery} from "@tanstack/react-query";
import {showToast} from "@/lib/toast";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

export const configurationKeys = {
  all: ["configuration"] as const,
  project: (projectPath: string | null) => [...configurationKeys.all, projectPath] as const,
};

export function useConfiguration(projectPath?: string) {
  const runtime = useRuntime();
  return useQuery(
    queryOptions({
      queryFn: () =>
        unwrap(runtime.configuration.get({projectPath})).catch((error: unknown) => {
          showToast("Unable to load configuration", "Check your settings.json files.", {id: "configuration-load-error"});
          throw error;
        }),
      queryKey: configurationKeys.project(projectPath ?? null),
      retry: false,
      staleTime: Infinity,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
    })
  );
}
