import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {useRuntime} from "@/runtime/hooks/use-runtime";

interface SubmitProviderLoginInputInput {
  readonly input: string;
  readonly loginSessionId: string;
}

export function useSubmitProviderLoginInput() {
  const runtime = useRuntime();
  return useMutation({
    mutationFn: (input: SubmitProviderLoginInputInput) => runtime.providers.submitLoginInput(input, context),
  });
}
