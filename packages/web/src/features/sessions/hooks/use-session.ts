import {useMemo} from "react";
import type {SessionStatus, SessionView} from "@/features/sessions/lib/session-view";
import {sessionStatus, sessionView} from "@/features/sessions/lib/session-view";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";

export function useSessionStatus(sessionId: string): SessionStatus {
  const entry = useSessionsStore((state) => state.entries[sessionId]);
  const optimism = useSessionsStore((state) => state.optimism[sessionId]);
  return sessionStatus(entry, optimism);
}

export function useSession(sessionId: string): SessionView & {readonly loadError: string | undefined} {
  const session = useSessionsStore((state) => state.documents[sessionId]);
  const entry = useSessionsStore((state) => state.entries[sessionId]);
  const optimism = useSessionsStore((state) => state.optimism[sessionId]);
  const loadError = useSessionsStore((state) => state.loadErrors[sessionId]);
  // Building turns walks every entry, and the page re-renders on every keystroke in the composer.
  const view = useMemo(() => sessionView({entry, optimism, session}), [entry, optimism, session]);
  return {...view, loadError};
}
