import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

interface PinSessionInput {
  readonly sessionId: string;
  readonly pinned: boolean;
}

const {patchOptimism} = useSessionsStore.getState();

/** Pins or unpins a session, moving it at once; the runtime's directory reports it once applied. */
export function usePinSession() {
  const runtime = useRuntime();

  return useMutation({
    mutationFn: (input: PinSessionInput) => unwrap(runtime.projects.pinSession(input, BACKGROUND_CONTEXT)),
    onMutate: (input) => patchOptimism(input.sessionId, {pinned: input.pinned}),
    onSettled: (_result, _error, input) => patchOptimism(input.sessionId, {pinned: undefined}),
  });
}
