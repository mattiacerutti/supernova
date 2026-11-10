import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import type {HistorySide} from "@supernova/contracts/services/chat/procedures";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import type {ChatOwner} from "@/runtime/client";

const {addHistoryPage} = useSessionsStore.getState();

async function loadPage(chat: ChatOwner, sessionId: string, side: HistorySide): Promise<void> {
  const session = useSessionsStore.getState().documents[sessionId];
  const edge = side === "entries" ? session?.entries.items[0]?.id : session?.undone.items.at(-1)?.id;
  if (edge === undefined) return;
  const page = await chat.loadHistory({side, edge}, context);
  addHistoryPage(sessionId, side, edge, page);
}

export function useLoadHistory(chat: ChatOwner | undefined, sessionId: string, side: HistorySide) {
  // `useMutation` returns a new object every render; its members are stable.
  const {isError, isPending, mutate} = useMutation({mutationFn: async () => (chat ? loadPage(chat, sessionId, side) : undefined)});
  return {
    failed: isError,
    load: (): void => {
      if (!isPending && !isError) mutate();
    },
    retry: (): void => mutate(),
  };
}
