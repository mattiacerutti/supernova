import {useMemo, useSyncExternalStore} from "react";
import {historyOf} from "@/features/sessions/api/chat-history";
import type {SessionStatus, SessionView} from "@/features/sessions/lib/session-view";
import {recordIn, sessionStatus, sessionView} from "@/features/sessions/lib/session-view";
import {useSessionOptimismStore} from "@/features/sessions/stores/session-optimism-store";
import type {RuntimeClient} from "@/runtime/client";
import {currentValue} from "@/runtime/references";
import {useRuntime} from "@/runtime/hooks/use-runtime";
import {useWatched} from "@/runtime/hooks/use-watched";

export function useSessionStatus(sessionId: string): SessionStatus {
  const entry = useWatched(useRuntime().status.statuses, (statuses) => statuses?.sessions[sessionId]);
  const optimism = useSessionOptimismStore((state) => state.optimism[sessionId]);
  return sessionStatus(entry, optimism);
}

export function useSessionRecord(sessionId: string | undefined) {
  const runtime = useRuntime();
  const created = useSessionOptimismStore((state) => (sessionId === undefined ? undefined : state.optimism[sessionId]?.created));
  const record = useWatched(runtime.sessions.view, (view) => (sessionId === undefined ? undefined : recordIn(view, sessionId)));
  return record ?? created;
}

export function useSession(sessionId: string): SessionView & {readonly loadError: string | undefined} {
  const runtime = useRuntime();
  const history = historyOf(runtime, sessionId);
  const {document, loadError} = useSyncExternalStore(history.subscribe, history.read);
  const record = useSessionRecord(sessionId);
  const entry = useWatched(runtime.status.statuses, (statuses) => statuses?.sessions[sessionId]);
  const optimism = useSessionOptimismStore((state) => state.optimism[sessionId]);
  // Building turns walks every entry, and the page re-renders on every keystroke in the composer.
  return useMemo(() => ({...sessionView({entry, optimism, record, session: document}), loadError}), [document, entry, loadError, optimism, record]);
}

export function readSessionView(runtime: RuntimeClient, sessionId: string): SessionView {
  const optimism = useSessionOptimismStore.getState().optimism[sessionId];
  return sessionView({
    entry: currentValue(runtime.status.statuses)?.sessions[sessionId],
    optimism,
    record: recordIn(currentValue(runtime.sessions.view), sessionId) ?? optimism?.created,
    session: historyOf(runtime, sessionId).read().document,
  });
}
