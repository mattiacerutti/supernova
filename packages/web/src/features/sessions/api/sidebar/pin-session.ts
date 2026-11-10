import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {useRuntime} from "@/runtime/hooks/use-runtime";

interface PinSessionInput {
  readonly sessionId: string;
  readonly pinned: boolean;
}

const {patchOptimism} = useSessionsStore.getState();

export function usePinSession() {
  const runtime = useRuntime();

  return useMutation({
    mutationFn: (input: PinSessionInput) => runtime.sessions.pin(input, context),
    onMutate: (input) => patchOptimism(input.sessionId, {pinned: input.pinned}),
    onSettled: (_result, _error, input) => patchOptimism(input.sessionId, {pinned: undefined}),
  });
}
