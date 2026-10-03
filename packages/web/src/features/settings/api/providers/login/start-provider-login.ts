import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import type {ProviderLoginStartPayload} from "@supernova/contracts/providers/procedures";
import {unwrap} from "@/rpc/runtime-result";
import {useRuntime} from "@/rpc/use-runtime";

export function useStartProviderLogin() {
  const runtime = useRuntime();
  return useMutation({
    mutationFn: (input: ProviderLoginStartPayload) => unwrap(runtime.providers.startLogin(input, BACKGROUND_CONTEXT)),
  });
}
