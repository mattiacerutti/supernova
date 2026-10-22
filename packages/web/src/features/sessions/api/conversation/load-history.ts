import {useMutation} from "@tanstack/react-query";
import type {HistorySide} from "@supernova/contracts/services/session-runtime/procedures";
import {withSessionRuntime} from "@/features/sessions/api/sessions-sync";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {unwrap} from "@/runtime/runtime-result";
import type {RuntimeClient} from "@/runtime/transport/runtime-client";
import {useRuntime} from "@/runtime/use-runtime";

const {addHistoryPage} = useSessionsStore.getState();

async function loadPage(runtime: RuntimeClient, sessionId: string, side: HistorySide): Promise<void> {
  const session = useSessionsStore.getState().documents[sessionId];
  const edge = side === "entries" ? session?.entries.items[0]?.id : session?.undone.items.at(-1)?.id;
  if (edge === undefined) return;
  const page = await withSessionRuntime(runtime, sessionId, (service) => unwrap(service.loadHistory({side, edge})));
  addHistoryPage(sessionId, side, edge, page);
}

/** `load` is a no-op while a page loads or after one failed, so it can run on every scroll; `retry` is the user's. */
export function useLoadHistory(sessionId: string, side: HistorySide) {
  const runtime = useRuntime();
  // `useMutation` returns a new object every render; reading only its stable members keeps these callbacks stable too.
  const {isError, isPending, mutate} = useMutation({mutationFn: () => loadPage(runtime, sessionId, side)});
  return {
    failed: isError,
    load: (): void => {
      if (!isPending && !isError) mutate();
    },
    retry: (): void => mutate(),
  };
}
