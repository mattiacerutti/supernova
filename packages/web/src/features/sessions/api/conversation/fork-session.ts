import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {useRuntime} from "@/runtime/hooks/use-runtime";

interface ForkSessionInput {
  readonly sessionId: string;
  readonly turnId: string;
}

export function useForkSession() {
  const services = useRuntime();

  return useMutation({
    mutationFn: (input: ForkSessionInput) => services.sessions.fork(input, context),
  });
}
