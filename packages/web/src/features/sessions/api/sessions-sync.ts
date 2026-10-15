import type {SessionRuntimeService} from "@supernova/contracts/services/session-runtime/services";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import {useMountEffect} from "@/hooks/use-mount-effect";
import {NoticeToasts} from "@/features/sessions/lib/session-notices";
import type {RuntimeClient, SessionRuntimeHold} from "@/runtime/transport/runtime-client";
import {useRuntime} from "@/runtime/use-runtime";

const {forget, setDocument, setEntries, setLoadError} = useSessionsStore.getState();

interface SessionHold {
  readonly hold: SessionRuntimeHold;
  count: number;
}

const holds = new WeakMap<RuntimeClient, Map<string, SessionHold>>();

function holdsOf(runtime: RuntimeClient): Map<string, SessionHold> {
  let held = holds.get(runtime);
  if (!held) {
    held = new Map();
    holds.set(runtime, held);
  }
  return held;
}

/** One handle per session, shared. A failed hold is dropped so the next acquire retries. */
function acquireSession(runtime: RuntimeClient, sessionId: string): SessionRuntimeHold {
  const held = holdsOf(runtime);
  let entry = held.get(sessionId);
  if (!entry) {
    const created: SessionHold = {hold: runtime.holdSession(sessionId), count: 0};
    entry = created;
    held.set(sessionId, created);
    created.hold.ready.catch(() => {
      if (held.get(sessionId) === created) held.delete(sessionId);
    });
  }
  const current = entry;
  current.count += 1;
  let released = false;
  return {
    service: current.hold.service,
    ready: current.hold.ready,
    release: () => {
      if (released) return;
      released = true;
      if (--current.count > 0) return;
      if (held.get(sessionId) === current) held.delete(sessionId);
      current.hold.release();
    },
  };
}

export async function withSessionRuntime<T>(runtime: RuntimeClient, sessionId: string, call: (service: SessionRuntimeService) => Promise<T>): Promise<T> {
  const {release, service} = acquireSession(runtime, sessionId);
  try {
    return await call(service);
  } finally {
    release();
  }
}

const isKnown = (sessionId: string): boolean => useSessionsStore.getState().documents[sessionId] !== undefined;

/** A read landing after the live document is dropped so it never replaces a newer value. */
function readDocument(runtime: RuntimeClient, sessionId: string): void {
  if (isKnown(sessionId)) return;
  void runtime.sessions.get({sessionId}).then(
    (result) => {
      if (isKnown(sessionId)) return;
      if (result.ok) setDocument(result.value);
      else setLoadError(sessionId, result.error.message);
    },
    (cause: unknown) => setLoadError(sessionId, cause instanceof Error ? cause.message : "Unable to load this session.")
  );
}

export function syncSessions(runtime: RuntimeClient): () => void {
  const notices = new NoticeToasts();
  return runtime.sessions.directory.subscribe((directory) => {
    if (!directory) return;
    setEntries(directory.sessions);
    notices.show(directory.sessions);
  });
}

/** A session that cannot be held yet (still being created) keeps the document it was read with. */
export function followSession(runtime: RuntimeClient, sessionId: string): () => void {
  readDocument(runtime, sessionId);
  const {release, service} = acquireSession(runtime, sessionId);
  const unsubscribe = service.session.subscribe((session) => {
    if (session?.id === sessionId) setDocument(session);
  });
  return () => {
    unsubscribe();
    release();
  };
}

export function usePrefetchSession(): (sessionId: string) => void {
  const runtime = useRuntime();
  return (sessionId) => readDocument(runtime, sessionId);
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
