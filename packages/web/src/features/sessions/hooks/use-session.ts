import {useMemo} from "react";
import type {SessionStatus, SessionView} from "@/features/sessions/lib/session-view";
import {sessionStatus, sessionView} from "@/features/sessions/lib/session-view";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";

export function useSessionStatus(sessionId: string): SessionStatus {
  const entry = useSessionsStore((state) => state.statuses[sessionId]);
  const optimism = useSessionsStore((state) => state.optimism[sessionId]);
  return sessionStatus(entry, optimism);
}

export function useSession(sessionId: string): SessionView & {readonly loadError: string | undefined} {
  const session = useSessionsStore((state) => state.documents[sessionId]);
  const record = useSessionsStore((state) => state.records[sessionId]);
  const entry = useSessionsStore((state) => state.statuses[sessionId]);
  const optimism = useSessionsStore((state) => state.optimism[sessionId]);
  const loadError = useSessionsStore((state) => state.loadErrors[sessionId]);
  // Building turns walks every entry, and the page re-renders on every keystroke in the composer.
  return useMemo(() => ({...sessionView({entry, optimism, record, session}), loadError}), [entry, loadError, optimism, record, session]);
}

/** The view as it is now, for handlers: reading it when they run keeps them from changing with every document update. */
export function readSessionView(sessionId: string): SessionView {
  const {documents, optimism, records, statuses} = useSessionsStore.getState();
  return sessionView({entry: statuses[sessionId], optimism: optimism[sessionId], record: records[sessionId], session: documents[sessionId]});
}
