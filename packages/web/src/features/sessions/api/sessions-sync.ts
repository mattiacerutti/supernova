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

/** Each runtime connection's held sessions; a session is held once, however many places use it. */
const holds = new WeakMap<RuntimeClient, Map<string, SessionHold>>();

function holdsOf(runtime: RuntimeClient): Map<string, SessionHold> {
  let held = holds.get(runtime);
  if (!held) {
    held = new Map();
    holds.set(runtime, held);
  }
  return held;
}

/**
 * Holds a session's runtime service until the returned release. Holds of one session share one Chord handle. A hold
 * that failed (an unknown session, or one still being created) is dropped, so the next acquire tries again.
 */
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

/** Runs `call` on a session's runtime service, holding it for the call. */
export async function withSessionRuntime<T>(runtime: RuntimeClient, sessionId: string, call: (service: SessionRuntimeService) => Promise<T>): Promise<T> {
  const {release, service} = acquireSession(runtime, sessionId);
  try {
    return await call(service);
  } finally {
    release();
  }
}

const isKnown = (sessionId: string): boolean => useSessionsStore.getState().documents[sessionId] !== undefined;

/**
 * Reads a session's document once, unless the store has it. A read that lands after the live document arrived is
 * dropped, so it never replaces a newer value.
 */
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

/**
 * Keeps the store's view of every session the runtime has open current and shows its notices. Returns the stop.
 * Called once, at app start. After a reconnect Chord holds the services again and their state arrives anew.
 */
export function syncSessions(runtime: RuntimeClient): () => void {
  const notices = new NoticeToasts();
  return runtime.sessions.directory.subscribe((directory) => {
    if (!directory) return;
    setEntries(directory.sessions);
    notices.show(directory.sessions);
  });
}

/**
 * Keeps a session's document in the store, read at once and then live, until the returned stop is called. Following
 * the same session from several places holds it once. A session that cannot be held yet (still being created) keeps
 * the document it was read with.
 */
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

/** Reads a session's document into the store ahead of opening it, unless it is already there. */
export function usePrefetchSession(): (sessionId: string) => void {
  const runtime = useRuntime();
  return (sessionId) => readDocument(runtime, sessionId);
}

/** Drops a session the runtime removed (archived, or failed to create). */
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

/**
 * Keeps a session's document in the store, read at once and then live, while the calling component is mounted, and
 * marks the session seen as it changes. Key the component by session.
 */
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
