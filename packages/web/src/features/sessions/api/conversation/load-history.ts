import {useMutation} from "@tanstack/react-query";
import type {HistorySide} from "@supernova/contracts/services/chat/procedures";
import {historyOf} from "@/features/sessions/api/chat-history";
import type {ChatOwner} from "@/runtime/client";
import {useRuntime} from "@/runtime/hooks/use-runtime";

export function useLoadHistory(chat: ChatOwner | undefined, sessionId: string, side: HistorySide) {
  const history = historyOf(useRuntime(), sessionId);
  // `useMutation` returns a new object every render; its members are stable.
  const {isError, isPending, mutate} = useMutation({mutationFn: async () => (chat ? history.loadPage(chat, side) : undefined)});
  return {
    failed: isError,
    load: (): void => {
      if (!isPending && !isError) mutate();
    },
    retry: (): void => mutate(),
  };
}
