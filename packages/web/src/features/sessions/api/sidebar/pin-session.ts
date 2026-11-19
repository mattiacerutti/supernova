import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {useSessionOptimismStore} from "@/features/sessions/stores/session-optimism-store";
import {useRuntime} from "@/runtime/hooks/use-runtime";

interface PinSessionInput {
  readonly sessionId: string;
  readonly pinned: boolean;
}

const {patchOptimism} = useSessionOptimismStore.getState();

export function usePinSession() {
  const runtime = useRuntime();

  return useMutation({
    mutationFn: (input: PinSessionInput) => runtime.sessions.pin(input, context),
    onMutate: (input) => patchOptimism(input.sessionId, {pinned: input.pinned}),
    onSettled: (_result, _error, input) => patchOptimism(input.sessionId, {pinned: undefined}),
  });
}
