import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {useRuntime} from "@/runtime/hooks/use-runtime";

interface RenameSessionInput {
  readonly sessionId: string;
  readonly title: string;
}

const {patchOptimism} = useSessionsStore.getState();

export function useRenameSession() {
  const runtime = useRuntime();

  return useMutation({
    mutationFn: (input: RenameSessionInput) => runtime.sessions.rename(input, context),
    onMutate: (input) => patchOptimism(input.sessionId, {title: input.title.trim()}),
    onSettled: (_result, _error, input) => patchOptimism(input.sessionId, {title: undefined}),
  });
}
