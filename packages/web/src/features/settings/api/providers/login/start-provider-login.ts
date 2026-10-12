import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import type {ProviderLoginStartPayload} from "@supernova/contracts/services/providers/procedures";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

export function useStartProviderLogin() {
  const runtime = useRuntime();
  return useMutation({
    mutationFn: (input: ProviderLoginStartPayload) => unwrap(runtime.providers.startLogin(input, BACKGROUND_CONTEXT)),
  });
}
