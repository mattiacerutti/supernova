import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {ChatService} from "@supernova/contracts/services/chat/services";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import {useMountEffect} from "@/hooks/use-mount-effect";
import {NoticeToasts} from "@/features/sessions/lib/session-notices";
import type {ChatOwner, RuntimeClient} from "@/runtime/client";
import type {OwnerOf} from "@/runtime/references";
import {asOwner, follow, whenLive} from "@/runtime/references";
import {useRuntime} from "@/runtime/hooks/use-runtime";

const {forget, setDocument, setLoadError, setRecord, setStatuses} = useSessionsStore.getState();

function mirror(sessionId: string, chat: ChatOwner): () => void {
  return follow(chat.document, (session) => {
    if (session?.id === sessionId) setDocument(session);
  });
}

const openSessions = new WeakMap<RuntimeClient, string>();

function openRecord(runtime: RuntimeClient, sessionId: string): () => void {
  openSessions.set(runtime, sessionId);
  void runtime.sessions.openSession({sessionId}, context).catch(() => undefined);
  const stop = follow(runtime.sessions.view, ({open}) => {
    if (open?.id === sessionId) setRecord(open);
  });
  return () => {
    stop();
    // The next page mounts before this one unmounts.
    if (openSessions.get(runtime) !== sessionId) return;
    openSessions.delete(runtime);
    void runtime.sessions.closeSession(context).catch(() => undefined);
  };
}

export function syncSessions(runtime: RuntimeClient): () => void {
  const notices = new NoticeToasts();
  return follow(runtime.status.statuses, (statuses) => {
    setStatuses(statuses.sessions);
    notices.show(statuses.sessions);
  });
}

export function followSession(runtime: RuntimeClient, sessionId: string, chat: OwnerOf<typeof ChatService>): () => void {
  let following = true;
  whenLive(chat).catch((cause: unknown) => {
    if (following) setLoadError(sessionId, cause instanceof Error ? cause.message : "Unable to load this session.");
  });
  const stop = mirror(sessionId, chat);
  const stopRecord = openRecord(runtime, sessionId);
  return () => {
    following = false;
    stop();
    stopRecord();
  };
}

const PREFETCH_HOLD_MS = 5_000;

export function usePrefetchSession(): (sessionId: string) => void {
  const runtime = useRuntime();
  return (sessionId) => {
    if (useSessionsStore.getState().documents[sessionId] !== undefined) return;
    const held = runtime.host.hold(ChatService, {sessionId}, context);
    const stop = mirror(sessionId, asOwner(held));
    const end = () => {
      stop();
      held.release();
    };
    whenLive(held).then(() => setTimeout(end, PREFETCH_HOLD_MS), end);
  };
}

export function forgetSession(sessionId: string): void {
  forget(sessionId);
}

export function markSeenAsItChanges(sessionId: string): () => void {
  // At the session's activity time: stamping now would hide a later completion.
  const markSeen = (session: {readonly updatedAt: string} | undefined) => session && useSessionVisitsStore.getState().markSessionVisited(sessionId, session.updatedAt);
  markSeen(useSessionsStore.getState().documents[sessionId]);
  return useSessionsStore.subscribe((state, previous) => {
    if (state.documents[sessionId] !== previous.documents[sessionId]) markSeen(state.documents[sessionId]);
  });
}

export function useFollowSession(sessionId: string, chat: OwnerOf<typeof ChatService>): void {
  const runtime = useRuntime();
  useMountEffect(() => {
    const stopFollowing = followSession(runtime, sessionId, chat);
    const stopMarking = markSeenAsItChanges(sessionId);
    return () => {
      stopFollowing();
      stopMarking();
    };
  });
}
