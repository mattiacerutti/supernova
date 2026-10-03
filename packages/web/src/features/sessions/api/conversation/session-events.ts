import type {QueryClient} from "@tanstack/react-query";
import type {ProjectSessionsListResult} from "@supernova/contracts/projects/procedures";
import type {Session, SessionSummary} from "@supernova/contracts/sessions/schemas";
import type {SessionDirectoryEntry, SessionDirectoryState} from "@supernova/contracts/sessions/services";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {useSessionLiveStore} from "@/features/sessions/stores/conversation/session-live-store";
import {useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import type {RuntimeClient} from "@/rpc/transport/runtime-client";

/** Upserts session metadata into cached project session lists. */
function applyProjectSessionSummary(input: {projectPath: string; queryClient: QueryClient; summary: SessionSummary}): void {
  const {projectPath, queryClient, summary} = input;
  queryClient.setQueriesData<ProjectSessionsListResult>({queryKey: sessionKeys.list(projectPath)}, (result) => {
    if (!result) return result;

    const current = result.sessions.find((session) => session.id === summary.id);
    if (current && JSON.stringify(current) === JSON.stringify({...current, ...summary})) return result;
    const sessions = current ? result.sessions.map((session) => (session.id === summary.id ? {...session, ...summary} : session)) : [summary, ...result.sessions];
    return {...result, sessions};
  });
}

/** Writes a value of the attached session's transcript into its cached document; the open session's activity is seen. */
function applyTranscript(input: {queryClient: QueryClient; session: Session}): void {
  const {queryClient, session} = input;
  const previous = queryClient.getQueryData<Session>(sessionKeys.detail(session.id));
  void queryClient.cancelQueries({exact: true, queryKey: sessionKeys.detail(session.id)});
  queryClient.setQueryData<Session>(sessionKeys.detail(session.id), session);
  useSessionLiveStore.getState().settlePending(session.id, Object.keys(session.turns).length);
  // Stamping the activity time rather than now keeps a later completion unseen.
  if (session.updatedAt !== previous?.updatedAt && useSessionLiveStore.getState().activeSessionId === session.id) {
    useSessionVisitsStore.getState().markSessionVisited(session.id, session.updatedAt);
  }
}

/** Applies one directory value: live state of every session the server has open, and their listing summaries. */
function applyDirectory(input: {previous: SessionDirectoryState | undefined; queryClient: QueryClient; value: SessionDirectoryState}): void {
  const {previous, queryClient, value} = input;
  useSessionLiveStore.getState().applyDirectory(value);
  for (const [sessionId, entry] of Object.entries(value.sessions)) {
    if (!entry.summary || previous?.sessions[sessionId]?.summary === entry.summary) continue;
    applyProjectSessionSummary({projectPath: entry.projectPath, queryClient, summary: entry.summary});
    queryClient.setQueryData<Session>(sessionKeys.detail(sessionId), (session) =>
      session ? {...session, title: entry.summary!.title, updatedAt: entry.summary!.updatedAt} : session
    );
  }
}

export interface SessionEventContext {
  readonly sessionId: string;
  readonly entry: SessionDirectoryEntry;
  readonly previous: SessionDirectoryEntry | undefined;
  readonly queryClient: QueryClient;
  /** Folder the session's agent runs in (its worktree or project), when the session is cached. */
  readonly workspacePath: string | undefined;
}

interface ConnectSessionEventsInput {
  readonly queryClient: QueryClient;
  readonly services: RuntimeClient;
  /** Runs after the session caches are updated for every changed directory entry; other features react here. */
  readonly onEvent?: (context: SessionEventContext) => void;
  /** Runs when the connection was re-established; state may have been missed. */
  readonly onReconnect?: () => void;
}

/**
 * Follows the server's replicated session state: the directory for every session, and the transcript of the session
 * the live store has open. Returns the cleanup.
 */
export function connectSessionEvents(input: ConnectSessionEventsInput): () => void {
  const {onEvent, onReconnect, queryClient, services} = input;
  let previous: SessionDirectoryState | undefined;
  const stopDirectory = services.directory.subscribe((value) => {
    applyDirectory({previous, queryClient, value});
    for (const [sessionId, entry] of Object.entries(value.sessions)) {
      const before = previous?.sessions[sessionId];
      if (before === entry) continue;
      const session = queryClient.getQueryData<Session>(sessionKeys.detail(sessionId));
      onEvent?.({entry, previous: before, queryClient, sessionId, workspacePath: session && (session.worktree?.path ?? session.projectPath)});
    }
    previous = value;
  });

  let reconnecting = false;
  const stopConnection = services.onConnectionChange((state) => {
    if (state === "disconnected") reconnecting = true;
    if (state !== "connected" || !reconnecting) return;
    reconnecting = false;
    void queryClient.invalidateQueries({queryKey: sessionKeys.all});
    onReconnect?.();
  });

  // The open session's transcript: attach when it changes, write every value into its cached document.
  let attached: {readonly sessionId: string; readonly stop: () => void} | undefined;
  const follow = (sessionId: string | null): void => {
    if (attached?.sessionId === sessionId) return;
    attached?.stop();
    attached = undefined;
    if (!sessionId) return;
    let stopped = false;
    let stopTranscript: (() => void) | undefined;
    attached = {
      sessionId,
      stop: () => {
        stopped = true;
        stopTranscript?.();
      },
    };
    void services.attach(sessionId).then(
      ({transcript}) => {
        if (stopped) return;
        stopTranscript = transcript.subscribe((session) => {
          if (session.id === sessionId) applyTranscript({queryClient, session});
        });
      },
      // A session that is not durable (legacy, or still being created) has no transcript; its read stays as it is.
      () => undefined
    );
  };
  follow(useSessionLiveStore.getState().activeSessionId);
  const stopFollowing = useSessionLiveStore.subscribe((state) => follow(state.activeSessionId));

  return () => {
    stopDirectory();
    stopConnection();
    stopFollowing();
    attached?.stop();
  };
}
