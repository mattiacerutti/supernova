import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import {useMountEffect} from "@/hooks/use-mount-effect";
import {NoticeToasts} from "@/features/sessions/lib/session-notices";
import type {ChatOwner, RuntimeClient, ServiceHold} from "@/runtime/transport/runtime-client";
import {follow} from "@/runtime/transport/follow";
import {useRuntime} from "@/runtime/use-runtime";

const {forget, setDocument, setLoadError, setRecord, setStatuses} = useSessionsStore.getState();

interface ChatHold {
  readonly hold: ServiceHold<ChatOwner>;
  count: number;
}

const holds = new WeakMap<RuntimeClient, Map<string, ChatHold>>();

function holdsOf(runtime: RuntimeClient): Map<string, ChatHold> {
  let held = holds.get(runtime);
  if (!held) {
    held = new Map();
    holds.set(runtime, held);
  }
  return held;
}

/** One handle per session, shared. A failed hold is dropped so the next acquire retries. */
function acquireChat(runtime: RuntimeClient, sessionId: string): ServiceHold<ChatOwner> {
  const held = holdsOf(runtime);
  let entry = held.get(sessionId);
  if (!entry) {
    const created: ChatHold = {hold: runtime.holdChat(sessionId), count: 0};
    entry = created;
    held.set(sessionId, created);
    created.hold.ready.catch(() => {
      if (held.get(sessionId) !== created) return;
      held.delete(sessionId);
      created.hold.release();
    });
  }
  const current = entry;
  current.count += 1;
  let released = false;
  return {
    service: current.hold.service,
    ready: current.hold.ready,
    onGone: current.hold.onGone,
    release: () => {
      if (released) return;
      released = true;
      if (--current.count > 0) return;
      if (held.get(sessionId) === current) held.delete(sessionId);
      current.hold.release();
    },
  };
}

export async function withChat<T>(runtime: RuntimeClient, sessionId: string, call: (service: ChatOwner) => Promise<T>): Promise<T> {
  const {release, service} = acquireChat(runtime, sessionId);
  try {
    return await call(service);
  } finally {
    release();
  }
}

function mirror(sessionId: string, service: ChatOwner): () => void {
  return follow(service.session, (session) => {
    if (session?.id === sessionId) setDocument(session);
  });
}

const openSessions = new WeakMap<RuntimeClient, string>();

/** The next page mounts before the last unmounts, so only the page opened last closes the view's open session. */
function openRecord(runtime: RuntimeClient, sessionId: string): () => void {
  openSessions.set(runtime, sessionId);
  void runtime.sessions.openSession({sessionId});
  const stop = follow(runtime.sessions.view, ({open}) => {
    if (open?.id === sessionId) setRecord(open);
  });
  return () => {
    stop();
    if (openSessions.get(runtime) !== sessionId) return;
    openSessions.delete(runtime);
    void runtime.sessions.closeSession();
  };
}

export function syncSessions(runtime: RuntimeClient): () => void {
  const notices = new NoticeToasts();
  return follow(runtime.status.statuses, (statuses) => {
    setStatuses(statuses.sessions);
    notices.show(statuses.sessions);
  });
}

export function followSession(runtime: RuntimeClient, sessionId: string): () => void {
  const {ready, release, service} = acquireChat(runtime, sessionId);
  ready.catch((cause: unknown) => setLoadError(sessionId, cause instanceof Error ? cause.message : "Unable to load this session."));
  const stop = mirror(sessionId, service);
  const stopRecord = openRecord(runtime, sessionId);
  return () => {
    stop();
    stopRecord();
    release();
  };
}

/** Long enough for the host to start and the first frames to arrive before the click. */
const PREFETCH_HOLD_MS = 5_000;

export function usePrefetchSession(): (sessionId: string) => void {
  const runtime = useRuntime();
  return (sessionId) => {
    if (useSessionsStore.getState().documents[sessionId] !== undefined) return;
    const {ready, release, service} = acquireChat(runtime, sessionId);
    const stop = mirror(sessionId, service);
    const end = () => {
      stop();
      release();
    };
    ready.then(() => setTimeout(end, PREFETCH_HOLD_MS), end);
  };
}

export function forgetSession(sessionId: string): void {
  forget(sessionId);
}

/** Stamps a session seen at its activity time whenever its document changes; stamping now would hide a later completion. */
export function markSeenAsItChanges(sessionId: string): () => void {
  const markSeen = (session: {readonly updatedAt: string} | undefined) => session && useSessionVisitsStore.getState().markSessionVisited(sessionId, session.updatedAt);
  markSeen(useSessionsStore.getState().documents[sessionId]);
  return useSessionsStore.subscribe((state, previous) => {
    if (state.documents[sessionId] !== previous.documents[sessionId]) markSeen(state.documents[sessionId]);
  });
}

export function useFollowSession(sessionId: string): void {
  const runtime = useRuntime();
  useMountEffect(() => {
    const stopFollowing = followSession(runtime, sessionId);
    const stopMarking = markSeenAsItChanges(sessionId);
    return () => {
      stopFollowing();
      stopMarking();
    };
  });
}
