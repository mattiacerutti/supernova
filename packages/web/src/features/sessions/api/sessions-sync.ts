import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import {useMountEffect} from "@/hooks/use-mount-effect";
import {unwrap} from "@/runtime/runtime-result";
import type {RuntimeClient} from "@/runtime/transport/runtime-client";
import {useRuntime} from "@/runtime/use-runtime";

const {forget, setDocument, setEntries, setLoadError} = useSessionsStore.getState();

/** What this client is doing with one runtime connection's session routing. */
interface Connection {
  /** The session the connection is attaching or attached to; attaches run one at a time, in order. */
  attachment: {readonly sessionId: string; readonly done: Promise<void>} | undefined;
  /** How many components follow each session's document; the session stays attached while any does. */
  readonly followers: Map<string, {count: number; readonly stop: () => void}>;
}

const connections = new WeakMap<RuntimeClient, Connection>();

function connectionOf(runtime: RuntimeClient): Connection {
  let connection = connections.get(runtime);
  if (!connection) {
    connection = {attachment: undefined, followers: new Map()};
    connections.set(runtime, connection);
  }
  return connection;
}

const isKnown = (sessionId: string): boolean => useSessionsStore.getState().documents[sessionId] !== undefined;

/**
 * Reads a session's document once, unless the store has it. A read that lands after the live document arrived is
 * dropped, so it never replaces a newer value.
 */
function readDocument(runtime: RuntimeClient, sessionId: string): void {
  if (isKnown(sessionId)) return;
  void runtime.sessions.get({sessionId}, BACKGROUND_CONTEXT).then(
    (result) => {
      if (isKnown(sessionId)) return;
      if (result.ok) setDocument(result.value);
      else setLoadError(sessionId, result.error.message);
    },
    (cause: unknown) => setLoadError(sessionId, cause instanceof Error ? cause.message : "Unable to load this session.")
  );
}

/**
 * Attaches the connection to a session, unless it already is, and binds `runtime.sessionRuntime` to it. Attaches run
 * in order, so the latest wins. Resolves once the session's state arrived. The server checks every session call
 * against the attachment, so a command attaches the session it is for before it calls.
 */
export function attachSession(runtime: RuntimeClient, sessionId: string): Promise<void> {
  const connection = connectionOf(runtime);
  if (connection.attachment?.sessionId === sessionId) return connection.attachment.done;
  const previous = connection.attachment?.done.catch(() => undefined) ?? Promise.resolve();
  const done = previous.then(async () => {
    await unwrap(runtime.sessions.attach(sessionId, BACKGROUND_CONTEXT));
    await runtime.bindSessionRuntime();
  });
  connection.attachment = {sessionId, done};
  // A failed attach is tried again by the next caller.
  done.catch(() => {
    if (connection.attachment?.done === done) connection.attachment = undefined;
  });
  return done;
}

/**
 * Puts every value of the attached session's replicated document in the store. Returns the stop. A session that
 * cannot attach (legacy, or not created yet) keeps the document it was read with.
 */
function followDocument(runtime: RuntimeClient, sessionId: string): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | undefined;
  void attachSession(runtime, sessionId).then(
    () => {
      if (stopped) return;
      unsubscribe = runtime.sessionRuntime.session.subscribe((session) => {
        if (session.id === sessionId) setDocument(session);
      });
    },
    () => undefined
  );
  return () => {
    stopped = true;
    unsubscribe?.();
  };
}

/**
 * Keeps the store's view of every session the runtime has open current, and attaches the followed session again
 * after a reconnect, since a dropped connection loses its attachment. Returns the stop. Called once, at app start.
 */
export function syncSessions(runtime: RuntimeClient): () => void {
  const stopDirectory = runtime.sessions.directory.subscribe((directory) => setEntries(directory.sessions));
  const connection = connectionOf(runtime);
  let lost: string | undefined;
  const stopConnection = runtime.onConnectionChange((state) => {
    if (state === "disconnected" && connection.attachment) {
      lost = connection.attachment.sessionId;
      connection.attachment = undefined;
    }
    if (state !== "connected" || !lost) return;
    const sessionId = lost;
    lost = undefined;
    void runtime.ready().then(() => attachSession(runtime, sessionId).catch(() => undefined));
  });
  return () => {
    stopDirectory();
    stopConnection();
  };
}

/**
 * Keeps a session's document in the store, read at once and then live, until the returned stop is called. Following
 * the same session from several places attaches it once.
 */
export function followSession(runtime: RuntimeClient, sessionId: string): () => void {
  const {followers} = connectionOf(runtime);
  const follower = followers.get(sessionId);
  if (follower) follower.count += 1;
  else {
    readDocument(runtime, sessionId);
    followers.set(sessionId, {count: 1, stop: followDocument(runtime, sessionId)});
  }
  return () => {
    const current = followers.get(sessionId);
    if (!current || --current.count > 0) return;
    followers.delete(sessionId);
    current.stop();
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
