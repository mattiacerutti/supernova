import type {QueryClient} from "@tanstack/react-query";
import type {ProjectSessionsListResult} from "@supernova/contracts/projects/procedures";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {Session, SessionSummary} from "@supernova/contracts/sessions/schemas";
import {Effect, Stream} from "effect";
import {allProjectSessionsQueryKey, listProjectSessionsQueryKey} from "@/features/projects/hooks/api/use-list-project-sessions";
import {allSessionsQueryKey, sessionQueryKey} from "@/features/sessions/hooks/api/use-session";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import type {AgentRpcClientApi, AgentRpcClientFiber} from "@/rpc/agent-rpc-client";

let connectionGeneration = 0;
let fiber: AgentRpcClientFiber | null = null;
let isConnecting = false;
let reconnectTimer: number | null = null;

/** Upserts session metadata into cached project session lists. */
function applyProjectSessionSummary(input: {projectPath: string; queryClient: QueryClient; sessionId: string; summary: SessionSummary}): void {
  const {projectPath, queryClient, sessionId, summary} = input;
  queryClient.setQueriesData<ProjectSessionsListResult>({queryKey: listProjectSessionsQueryKey(projectPath)}, (result) => {
    if (!result) return result;

    const sessionExists = result.sessions.some((session) => session.id === sessionId);
    const sessions = sessionExists ? result.sessions.map((session) => (session.id === sessionId ? summary : session)) : [summary, ...result.sessions];
    return {...result, sessions};
  });
}

/** Applies query-cache changes after the live store accepts an event revision. */
function applyEvent(input: {event: SessionStreamEvent; queryClient: QueryClient}): void {
  const {event, queryClient} = input;

  if (event.type === "connected") {
    useSessionLiveStore.getState().resetRevisions();
    void queryClient.invalidateQueries({queryKey: allSessionsQueryKey()});
    void queryClient.invalidateQueries({queryKey: allProjectSessionsQueryKey()});
    return;
  }

  if (!("revision" in event)) return;

  const current = useSessionLiveStore.getState().sessions[event.sessionId];
  if (current && event.revision <= current.revision) return;

  if (event.type === "session.snapshot") {
    // Commit the replacement before removing liveTurn so the timeline never renders without either projection.
    void queryClient.cancelQueries({exact: true, queryKey: sessionQueryKey(event.sessionId)});
    queryClient.setQueryData<Session>(sessionQueryKey(event.sessionId), event.session);
    applyProjectSessionSummary({
      projectPath: event.session.projectPath,
      queryClient,
      sessionId: event.sessionId,
      summary: {id: event.session.id, title: event.session.title, updatedAt: event.session.updatedAt},
    });
  } else if (event.type === "session.updated") {
    queryClient.setQueryData<Session>(sessionQueryKey(event.sessionId), (session) =>
      session ? {...session, title: event.summary.title, updatedAt: event.summary.updatedAt} : session
    );
    applyProjectSessionSummary({projectPath: event.projectPath, queryClient, sessionId: event.sessionId, summary: event.summary});
  }

  useSessionLiveStore.getState().applyEvent(event);
}

interface ConnectSessionEventsInput {
  readonly queryClient: QueryClient;
  readonly rpcClient: AgentRpcClientApi;
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
              if (generation === connectionGeneration) applyEvent({event, queryClient: input.queryClient});
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
