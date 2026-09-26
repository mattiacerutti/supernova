import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {showToast} from "@/lib/toast";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export const configurationKeys = {
  all: ["configuration"] as const,
  project: (projectPath: string | null) => [...configurationKeys.all, projectPath] as const,
};

/** Caches effective server configuration in the query cache without persisting it in browser storage. */
export function useConfiguration(projectPath?: string) {
  return useQuery(
    eq.queryOptions({
      queryFn: () =>
        Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.getConfiguration({projectPath})).pipe(
          Effect.tapError(() => Effect.sync(() => showToast("Unable to load configuration", "Check your settings.json files.", {id: "configuration-load-error"})))
        ),
      queryKey: configurationKeys.project(projectPath ?? null),
      retry: false,
      staleTime: Infinity,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
    })
  );
}
