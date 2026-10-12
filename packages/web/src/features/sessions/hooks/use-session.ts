import {useMemo} from "react";
import type {SessionStatus, SessionView} from "@/features/sessions/lib/session-view";
import {sessionStatus, sessionView} from "@/features/sessions/lib/session-view";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";

/** What a session is doing, as the UI shows it; for a sidebar row. */
export function useSessionStatus(sessionId: string): SessionStatus {
  const entry = useSessionsStore((state) => state.entries[sessionId]);
  const optimism = useSessionsStore((state) => state.optimism[sessionId]);
  return sessionStatus(entry, optimism);
}

/**
 * A session as its page shows it, with the user's optimism applied. `loadError` is set when its document could not be
 * read. Reads only the store; `useFollowSession` (`api/sessions-sync`) keeps the document in it.
 */
export function useSession(sessionId: string): SessionView & {readonly loadError: string | undefined} {
  const session = useSessionsStore((state) => state.documents[sessionId]);
  const entry = useSessionsStore((state) => state.entries[sessionId]);
  const optimism = useSessionsStore((state) => state.optimism[sessionId]);
  const loadError = useSessionsStore((state) => state.loadErrors[sessionId]);
  // Building turns walks every entry, and the page re-renders on every keystroke in the composer.
  const view = useMemo(() => sessionView({entry, optimism, session}), [entry, optimism, session]);
  return {...view, loadError};
}
