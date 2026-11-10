import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import type {ProviderLoginStartPayload} from "@supernova/contracts/services/providers/procedures";
import {useRuntime} from "@/runtime/hooks/use-runtime";

export function useStartProviderLogin() {
  const runtime = useRuntime();
  return useMutation({
    mutationFn: (input: ProviderLoginStartPayload) => runtime.providers.startLogin(input, context),
  });
}
