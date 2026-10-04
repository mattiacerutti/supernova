import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

interface CancelProviderLoginInput {
  readonly loginSessionId: string;
}

export function useCancelProviderLogin() {
  const runtime = useRuntime();
  return useMutation({
    mutationFn: (input: CancelProviderLoginInput) => unwrap(runtime.providers.cancelLogin(input, BACKGROUND_CONTEXT)),
  });
}
