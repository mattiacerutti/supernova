import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {ChatService} from "@supernova/contracts/services/chat/services";
import type {SessionStatusEntry} from "@supernova/contracts/services/sessions/services";
import {historyOf} from "@/features/sessions/api/chat-history";
import {NoticeToasts} from "@/features/sessions/lib/session-notices";
import {useSessionOptimismStore} from "@/features/sessions/stores/session-optimism-store";
import {useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import {useMountEffect} from "@/hooks/use-mount-effect";
import type {RuntimeClient} from "@/runtime/client";
import type {OwnerOf} from "@/runtime/references";
import {asOwner, follow, whenLive} from "@/runtime/references";
import {useRuntime} from "@/runtime/hooks/use-runtime";

const openSessions = new WeakMap<RuntimeClient, string>();

function openRecord(runtime: RuntimeClient, sessionId: string): () => void {
  openSessions.set(runtime, sessionId);
  void runtime.sessions.openSession({sessionId}, context).catch(() => undefined);
  return () => {
    // The next page mounts before this one unmounts.
    if (openSessions.get(runtime) !== sessionId) return;
    openSessions.delete(runtime);
    void runtime.sessions.closeSession(context).catch(() => undefined);
  };
}

export function syncSessions(runtime: RuntimeClient, onRunEnded: () => void): () => void {
  const notices = new NoticeToasts();
  let previous: Readonly<Record<string, SessionStatusEntry>> = {};
  return follow(runtime.status.statuses, ({sessions}) => {
    notices.show(sessions);
    if (Object.entries(previous).some(([sessionId, entry]) => entry.activity !== "idle" && (sessions[sessionId]?.activity ?? "idle") === "idle")) onRunEnded();
    previous = sessions;
  });
}

export function followSession(runtime: RuntimeClient, sessionId: string, chat: OwnerOf<typeof ChatService>): () => void {
  const stopHistory = historyOf(runtime, sessionId).follow(chat);
  const stopRecord = openRecord(runtime, sessionId);
  return () => {
    stopHistory();
    stopRecord();
  };
}

const PREFETCH_HOLD_MS = 5_000;

export function usePrefetchSession(): (sessionId: string) => void {
  const runtime = useRuntime();
  return (sessionId) => {
    const history = historyOf(runtime, sessionId);
    if (history.read().document !== undefined) return;
    const held = runtime.host.hold(ChatService, {sessionId}, context);
    const stop = history.follow(asOwner(held));
    const end = () => {
      stop();
      held.release();
    };
    whenLive(held).then(() => setTimeout(end, PREFETCH_HOLD_MS), end);
  };
}

export function forgetSession(runtime: RuntimeClient, sessionId: string): void {
  useSessionOptimismStore.getState().forgetOptimism(sessionId);
  historyOf(runtime, sessionId).clear();
}

export function markSeenAsItChanges(runtime: RuntimeClient, sessionId: string): () => void {
  const history = historyOf(runtime, sessionId);
  let seen = history.read().document;
  // At the session's activity time: stamping now would hide a later completion.
  const markSeen = () => seen && useSessionVisitsStore.getState().markSessionVisited(sessionId, seen.updatedAt);
  markSeen();
  return history.subscribe(() => {
    const {document} = history.read();
    if (document === seen) return;
    seen = document;
    markSeen();
  });
}

export function useFollowSession(sessionId: string, chat: OwnerOf<typeof ChatService>): void {
  const runtime = useRuntime();
  useMountEffect(() => {
    const stopFollowing = followSession(runtime, sessionId, chat);
    const stopMarking = markSeenAsItChanges(runtime, sessionId);
    return () => {
      stopFollowing();
      stopMarking();
    };
  });
}
