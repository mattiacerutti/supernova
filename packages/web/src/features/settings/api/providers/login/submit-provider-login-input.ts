import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

interface SubmitProviderLoginInputInput {
  readonly input: string;
  readonly loginSessionId: string;
}

export function useSubmitProviderLoginInput() {
  const runtime = useRuntime();
  return useMutation({
    mutationFn: (input: SubmitProviderLoginInputInput) => unwrap(runtime.providers.submitLoginInput(input, BACKGROUND_CONTEXT)),
  });
}
