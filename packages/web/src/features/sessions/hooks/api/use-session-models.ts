import {useQuery, useQueryClient} from "@tanstack/react-query";
import {showToast} from "@/components/ui/toast-manager";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

/** Keeps each project's model query waiting on its own extension discovery. */
export function sessionModelsQueryKey(projectPath: string) {
  return ["session", "models", projectPath] as const;
}

/** Loads models after extension providers are registered, with an explicit retry on failure. */
export function useSessionModels(projectPath: string) {
  const queryClient = useQueryClient();
  const queryKey = sessionModelsQueryKey(projectPath);

  return useQuery(
    eq.queryOptions({
      queryFn: () =>
        Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listModels({projectPath})).pipe(
          Effect.tapError(() =>
            Effect.sync(() =>
              showToast("Unable to load models", "Check your settings and extensions, then retry.", {
                id: `models-load-error:${projectPath}`,
                actionProps: {children: "Retry", onClick: () => void queryClient.invalidateQueries({queryKey})},
              })
            )
          )
        ),
      queryKey,
      retry: false,
      refetchOnWindowFocus: false,
    })
  );
}
