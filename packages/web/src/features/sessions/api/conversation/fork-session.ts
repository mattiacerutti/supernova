import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

interface ForkSessionInput {
  readonly sessionId: string;
  readonly turnId: string;
}

export function useForkSession() {
  const queryClient = useQueryClient();
  const services = useRuntime();

  return useMutation({
    mutationFn: (input: ForkSessionInput) => unwrap(services.sessions.fork(input, BACKGROUND_CONTEXT)),
    onSuccess: async (session) => {
      // The fork opens next; its document is already known.
      useSessionsStore.getState().setDocument(session);
      await queryClient.invalidateQueries({queryKey: sessionKeys.list(session.projectPath)});
    },
  });
}
