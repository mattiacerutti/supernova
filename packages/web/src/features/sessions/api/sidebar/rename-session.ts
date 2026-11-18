import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {useSessionOptimismStore} from "@/features/sessions/stores/session-optimism-store";
import {useRuntime} from "@/runtime/hooks/use-runtime";

interface RenameSessionInput {
  readonly sessionId: string;
  readonly title: string;
}

const {patchOptimism} = useSessionOptimismStore.getState();

export function useRenameSession() {
  const runtime = useRuntime();

  return useMutation({
    mutationFn: (input: RenameSessionInput) => runtime.sessions.rename(input, context),
    onMutate: (input) => patchOptimism(input.sessionId, {title: input.title.trim()}),
    onSettled: (_result, _error, input) => patchOptimism(input.sessionId, {title: undefined}),
  });
}
