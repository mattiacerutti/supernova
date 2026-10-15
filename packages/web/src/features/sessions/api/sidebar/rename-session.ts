import {useMutation} from "@tanstack/react-query";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

interface RenameSessionInput {
  readonly sessionId: string;
  readonly title: string;
}

const {patchOptimism} = useSessionsStore.getState();

export function useRenameSession() {
  const runtime = useRuntime();

  return useMutation({
    mutationFn: (input: RenameSessionInput) => unwrap(runtime.sessions.rename(input)),
    onMutate: (input) => patchOptimism(input.sessionId, {title: input.title.trim()}),
    onSettled: (_result, _error, input) => patchOptimism(input.sessionId, {title: undefined}),
  });
}
