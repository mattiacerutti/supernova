import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/protocol";
import {showToast} from "@/components/ui/toast-manager";

/** Caches effective server configuration in the query cache without persisting it in browser storage. */
export function useConfiguration(projectPath?: string) {
  return useQuery(
    eq.queryOptions({
      queryKey: ["configuration", projectPath ?? null] as const,
      queryFn: () =>
        Effect.gen(function* () {
          const rpc = yield* RpcProtocolClientService;
          return yield* rpc
            .getConfiguration({projectPath})
            .pipe(Effect.tapError(() => Effect.sync(() => showToast("Unable to load configuration", "Check your settings.json files.", {id: "configuration-load-error"}))));
        }),
      retry: false,
      staleTime: Infinity,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
    })
  );
}
