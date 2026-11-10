import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {useRuntime} from "@/runtime/hooks/use-runtime";

interface ForkSessionInput {
  readonly sessionId: string;
  readonly turnId: string;
}

export function useForkSession() {
  const services = useRuntime();

  return useMutation({
    mutationFn: (input: ForkSessionInput) => services.sessions.fork(input, context),
    onSuccess: (record) => useSessionsStore.getState().setRecord(record),
  });
}
