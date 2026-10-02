import type {QueryClient} from "@tanstack/react-query";
import type {ProjectSessionsListResult} from "@supernova/contracts/projects/procedures";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {Session, SessionSummary} from "@supernova/contracts/sessions/schemas";
import {applyImmutable} from "@earendil-works/chord/delta";
import {Effect, Stream} from "effect";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {useSessionLiveStore} from "@/features/sessions/stores/conversation/session-live-store";
import {useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import type {RpcClient, RpcClientFiber} from "@/rpc/transport/protocol";

let connectionGeneration = 0;
let fiber: RpcClientFiber | null = null;
let isConnecting = false;
let reconnectTimer: number | null = null;

/** Upserts session metadata into cached project session lists. */
function applyProjectSessionSummary(input: {projectPath: string; queryClient: QueryClient; sessionId: string; summary: SessionSummary}): void {
  const {projectPath, queryClient, sessionId, summary} = input;
  queryClient.setQueriesData<ProjectSessionsListResult>({queryKey: sessionKeys.list(projectPath)}, (result) => {
    if (!result) return result;

    const sessionExists = result.sessions.some((session) => session.id === sessionId);
    const sessions = sessionExists ? result.sessions.map((session) => (session.id === sessionId ? {...session, ...summary} : session)) : [summary, ...result.sessions];
    return {...result, sessions};
  });
}

/**
 * Applies a Chord delta to the cached session document. It applies only to the version it was made from; a cached
 * document further behind (or a placeholder) is refetched, and stale or duplicate deltas are ignored.
 */
function applySessionState(input: {event: Extract<SessionStreamEvent, {type: "session.state"}>; queryClient: QueryClient}): void {
  const {event, queryClient} = input;
  const queryKey = sessionKeys.detail(event.sessionId);
  const cached = queryClient.getQueryData<Session>(queryKey);
  if (!cached || cached.version >= event.version) return;
  if (cached.version !== event.version - 1) {
    void queryClient.invalidateQueries({exact: true, queryKey});
    return;
  }

  const session = applyImmutable(cached, event.ops);
  void queryClient.cancelQueries({exact: true, queryKey});
  queryClient.setQueryData<Session>(queryKey, session);
  useSessionLiveStore.getState().settlePending(event.sessionId, Object.keys(session.turns).length);
  // Activity in the open session is seen as it happens; stamping the activity time keeps a later completion unseen.
  if (session.updatedAt !== cached.updatedAt && useSessionLiveStore.getState().activeSessionId === session.id) {
    useSessionVisitsStore.getState().markSessionVisited(session.id, session.updatedAt);
  }
  if (session.title !== cached.title || session.updatedAt !== cached.updatedAt) {
    applyProjectSessionSummary({
      projectPath: session.projectPath,
      queryClient,
      sessionId: session.id,
      summary: {id: session.id, forked: session.forked, title: session.title, updatedAt: session.updatedAt, worktree: session.worktree !== undefined},
    });
  }
}

/** Applies query-cache changes after the live store accepts an event revision. */
function applyEvent(input: {event: SessionStreamEvent; queryClient: QueryClient}): void {
  const {event, queryClient} = input;

  if (event.type === "connected") {
    useSessionLiveStore.getState().resetRevisions();
    void queryClient.invalidateQueries({queryKey: sessionKeys.all});
    return;
  }

  if (!("revision" in event)) return;

  const current = useSessionLiveStore.getState().sessions[event.sessionId];
  if (current && event.revision <= current.revision) return;

  if (event.type === "session.state") {
    applySessionState({event, queryClient});
  } else if (event.type === "session.updated") {
    applyProjectSessionSummary({projectPath: event.projectPath, queryClient, sessionId: event.sessionId, summary: event.summary});
  }

  useSessionLiveStore.getState().applyEvent(event);
}

export interface SessionEventContext {
  readonly event: SessionStreamEvent;
  readonly queryClient: QueryClient;
  /** Folder the session's agent runs in (its worktree or project), when the session is cached. */
  readonly workspacePath: string | undefined;
}

interface ConnectSessionEventsInput {
  readonly queryClient: QueryClient;
  readonly rpcClient: RpcClient;
  /** Runs after the session caches are updated; other features react to the stream here. */
  readonly onEvent?: (context: SessionEventContext) => void;
}

/** Connects the global session event stream and returns its cleanup. */
export function connectSessionEvents(input: ConnectSessionEventsInput): () => void {
  if (fiber || isConnecting) return () => undefined;

  const generation = ++connectionGeneration;
  const start = (): void => {
    if (generation !== connectionGeneration || fiber || isConnecting) return;
    isConnecting = true;

    void input.rpcClient
      .fork((rpc) =>
        rpc.watchEvents().pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              if (generation !== connectionGeneration) return;
              applyEvent({event, queryClient: input.queryClient});
              const session = "sessionId" in event ? input.queryClient.getQueryData<Session>(sessionKeys.detail(event.sessionId)) : undefined;
              input.onEvent?.({event, queryClient: input.queryClient, workspacePath: session && (session.worktree?.path ?? session.projectPath)});
            })
          )
        )
      )
      .then((newFiber) => {
        if (generation !== connectionGeneration) {
          void newFiber.interrupt();
          return;
        }

        isConnecting = false;
        fiber = newFiber;
        void newFiber.completed.then(() => {
          if (generation !== connectionGeneration || fiber !== newFiber) return;
          fiber = null;
          reconnectTimer = window.setTimeout(start, 1_000);
        });
      })
      .catch(() => {
        if (generation !== connectionGeneration) return;
        isConnecting = false;
        fiber = null;
        reconnectTimer = window.setTimeout(start, 1_000);
      });
  };

  start();

  return () => {
    connectionGeneration += 1;
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);

    reconnectTimer = null;
    isConnecting = false;
    void fiber?.interrupt();
    fiber = null;
  };
}
