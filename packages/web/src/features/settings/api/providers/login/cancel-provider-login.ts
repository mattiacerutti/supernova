import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {useRuntime} from "@/runtime/hooks/use-runtime";

interface CancelProviderLoginInput {
  readonly loginSessionId: string;
}

export function useCancelProviderLogin() {
  const runtime = useRuntime();
  return useMutation({
    mutationFn: (input: CancelProviderLoginInput) => runtime.providers.cancelLogin(input, context),
  });
}
