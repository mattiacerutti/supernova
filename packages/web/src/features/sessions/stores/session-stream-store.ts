import type {QueryClient} from "@tanstack/react-query";
import type {
  AgentSessionStreamEvent,
  IAgentModelReference,
  IAgentSessionDetails,
  IAgentSessionSummary,
  IAgentSessionTurn,
  IAgentSessionUserMessage,
} from "@pi-desktop/contracts/sessions";
import type {IAgentProjectSessionsListResult} from "@pi-desktop/contracts/projects";
import {create} from "zustand";
import {Effect, Stream} from "effect";
import {listProjectSessionsQueryKey} from "@/features/projects/hooks/api/use-list-project-sessions";
import {sessionQueryKey} from "@/features/sessions/hooks/api/use-session";
import type {IAgentRpcClient, IAgentRpcClientFiber} from "@/rpc/agent-rpc-client";

type SessionStreamStatus = "idle" | "streaming" | "stopping";

export interface ISessionStreamState {
  readonly error: string | null;
  readonly model: IAgentModelReference;
  readonly projectPath: string;
  readonly status: SessionStreamStatus;
  readonly streamId: string;
  readonly turn: IAgentSessionTurn | null;
  readonly turns: readonly IAgentSessionTurn[];
}

interface ISessionStreamEntry extends ISessionStreamState {
  readonly fiber: IAgentRpcClientFiber | null;
}

interface IStartSessionStreamInput {
  readonly message: string;
  readonly model: IAgentModelReference;
  readonly projectPath: string;
  readonly queryClient: QueryClient;
  readonly rpcClient: IAgentRpcClient;
  readonly sessionId: string;
  readonly sessionTurns: readonly IAgentSessionTurn[];
}

interface ISessionStreamStoreState {
  readonly streams: Record<string, ISessionStreamEntry | undefined>;
  readonly startStream: (input: IStartSessionStreamInput) => void;
  readonly stopAllStreams: () => void;
  readonly stopStream: (sessionId: string) => void;
}

function createStreamId(sessionId: string): string {
  return `${sessionId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function createInitialStreamTurn(input: {message: string; model: IAgentModelReference}): IAgentSessionTurn {
  const timestamp = new Date().toISOString();
  const localMessage: IAgentSessionUserMessage = {content: input.message, id: `local-${Date.now()}`, timestamp};

  return {
    events: [],
    id: `turn-${localMessage.id}`,
    model: input.model,
    startedAt: timestamp,
    status: "streaming",
    userMessage: localMessage,
  };
}

function applySessionSummary(input: {projectPath: string; queryClient: QueryClient; sessionId: string; summary: IAgentSessionSummary}): void {
  const {projectPath, queryClient, sessionId, summary} = input;

  queryClient.setQueryData<IAgentSessionDetails>(sessionQueryKey(sessionId), (session) => (session ? {...session, title: summary.title, updatedAt: summary.updatedAt} : session));
  queryClient.setQueriesData<IAgentProjectSessionsListResult>({queryKey: listProjectSessionsQueryKey(projectPath)}, (result) => {
    if (!result) return result;

    const sessionExists = result.sessions.some((session) => session.id === sessionId);
    const sessions = sessionExists
      ? result.sessions.map((session) => (session.id === sessionId ? {...session, title: summary.title, updatedAt: summary.updatedAt} : session))
      : [summary, ...result.sessions];

    return {...result, sessions};
  });
}

function applyDoneTurns(input: {queryClient: QueryClient; sessionId: string; turns: readonly IAgentSessionTurn[]}): void {
  const {queryClient, sessionId, turns} = input;
  queryClient.setQueryData<IAgentSessionDetails>(sessionQueryKey(sessionId), (session) => (session ? {...session, turns} : session));
}

export const useSessionStreamStore = create<ISessionStreamStoreState>()((set, get) => {
  const updateStream = (sessionId: string, streamId: string, update: (entry: ISessionStreamEntry) => ISessionStreamEntry | undefined): void => {
    set((state) => {
      const current = state.streams[sessionId];
      if (!current || current.streamId !== streamId) return state;

      return {streams: {...state.streams, [sessionId]: update(current)}};
    });
  };

  const finishStream = (sessionId: string, streamId: string, queryClient: QueryClient): void => {
    updateStream(sessionId, streamId, (entry) => ({...entry, fiber: null, status: "idle", turn: null}));
    void queryClient.invalidateQueries({queryKey: sessionQueryKey(sessionId)});
  };

  const handleStreamEvent = (input: {event: AgentSessionStreamEvent; projectPath: string; queryClient: QueryClient; sessionId: string; streamId: string}): void => {
    const {event, projectPath, queryClient, sessionId, streamId} = input;

    if (event.type === "ready") {
      updateStream(sessionId, streamId, (entry) => ({...entry, turns: event.turns}));
      applyDoneTurns({queryClient, sessionId, turns: event.turns});
      return;
    }

    if (event.type === "turn") {
      if (event.session) applySessionSummary({projectPath, queryClient, sessionId, summary: event.session});
      updateStream(sessionId, streamId, (entry) => ({...entry, turn: event.turn}));
      return;
    }

    if (event.type === "done") {
      applyDoneTurns({queryClient, sessionId, turns: event.turns});
      updateStream(sessionId, streamId, (entry) => ({...entry, status: "idle", turn: null, turns: event.turns}));
      return;
    }

    updateStream(sessionId, streamId, (entry) => ({...entry, error: event.error, status: "idle", turn: null}));
  };

  return {
    streams: {},
    startStream: (input) => {
      const {message, model, projectPath, queryClient, rpcClient, sessionId, sessionTurns} = input;
      const current = get().streams[sessionId];
      if (current?.status === "streaming" || current?.status === "stopping") return;

      const streamId = createStreamId(sessionId);
      const turn = createInitialStreamTurn({message, model});

      set((state) => ({
        streams: {
          ...state.streams,
          [sessionId]: {error: null, fiber: null, model, projectPath, status: "streaming", streamId, turn, turns: sessionTurns},
        },
      }));

      void rpcClient
        .fork((rpc) =>
          rpc.sendSessionMessage({message, model, sessionId}).pipe(
            Stream.runForEach((event) => Effect.sync(() => handleStreamEvent({event, projectPath, queryClient, sessionId, streamId}))),
            Effect.catch((cause: unknown) =>
              Effect.sync(() =>
                updateStream(sessionId, streamId, (entry) => ({...entry, error: cause instanceof Error ? cause.message : "Failed to send message.", status: "idle", turn: null}))
              )
            ),
            Effect.ensuring(Effect.sync(() => finishStream(sessionId, streamId, queryClient)))
          )
        )
        .then((fiber) => {
          const entry = get().streams[sessionId];
          if (!entry || entry.streamId !== streamId) {
            void fiber.interrupt();
            return;
          }

          if (entry.status === "stopping") {
            void fiber.interrupt();
            return;
          }

          set((state) => {
            const currentEntry = state.streams[sessionId];
            if (!currentEntry || currentEntry.streamId !== streamId) return state;
            return {streams: {...state.streams, [sessionId]: {...currentEntry, fiber}}};
          });
        })
        .catch((cause: unknown) => {
          updateStream(sessionId, streamId, (entry) => ({...entry, error: cause instanceof Error ? cause.message : "Failed to send message.", status: "idle", turn: null}));
        });
    },
    stopAllStreams: () => {
      for (const [sessionId, stream] of Object.entries(get().streams)) {
        if (!stream || stream.status === "idle") continue;
        get().stopStream(sessionId);
      }
    },
    stopStream: (sessionId) => {
      const stream = get().streams[sessionId];
      if (!stream || stream.status === "idle") return;

      set((state) => ({streams: {...state.streams, [sessionId]: {...stream, status: "stopping"}}}));
      void stream.fiber?.interrupt();
    },
  };
});
