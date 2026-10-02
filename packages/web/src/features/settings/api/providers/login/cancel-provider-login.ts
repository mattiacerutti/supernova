import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {unwrap} from "@/rpc/runtime-result";
import {useRuntime} from "@/rpc/use-runtime";

interface CancelProviderLoginInput {
  readonly loginSessionId: string;
}

export function useCancelProviderLogin() {
  const runtime = useRuntime();
  return useMutation({
    mutationFn: (input: CancelProviderLoginInput) => unwrap(runtime.providers.cancelLogin(input, BACKGROUND_CONTEXT)),
  });
}
