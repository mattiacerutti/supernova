import {useMutation} from "@tanstack/react-query";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

interface ForkSessionInput {
  readonly sessionId: string;
  readonly turnId: string;
}

export function useForkSession() {
  const services = useRuntime();

  return useMutation({
    mutationFn: (input: ForkSessionInput) => unwrap(services.sessions.fork(input)),
    // Listings show the fork once the catalog has it.
    onSuccess: (record) => useSessionsStore.getState().setRecord(record),
  });
}
