import type {QueryClient} from "@tanstack/react-query";
import type {AgentSessionStreamEvent} from "@pi-desktop/contracts/sessions/procedures";
import type {
  AgentModelReference,
  AgentSessionAttachment,
  AgentSessionDetails,
  AgentSessionSummary,
  AgentSessionTurn,
  AgentSessionUserMessage,
} from "@pi-desktop/contracts/sessions/schemas";
import type {AgentProjectSessionsListResult} from "@pi-desktop/contracts/projects/procedures";
import {create} from "zustand";
import {Effect, Stream} from "effect";
import {listProjectSessionsQueryKey} from "@/features/projects/hooks/api/use-list-project-sessions";
import {sessionQueryKey} from "@/features/sessions/hooks/api/use-session";
import {upsertInterruptedTurn} from "@/features/sessions/lib/streaming/interrupted-turns";
import type {AgentRpcClientApi, AgentRpcClientFiber} from "@/rpc/agent-rpc-client";

export type SessionStreamStatus = "idle" | "streaming" | "stopping";

export interface SessionStreamState {
  readonly error: string | null;
  /** Drives the composer button and prevents duplicate sends while a turn is active. */
  readonly status: SessionStreamStatus;
  /** Unique per-send token. Async callbacks use this to avoid mutating a newer stream for the same session. */
  readonly streamId: string;
  /** Currently streaming turn, kept separate from committed turns until the runtime confirms completion. */
  readonly turn: AgentSessionTurn | null;
  /** Last committed transcript snapshot used as the base while optimistic streaming UI is active. */
  readonly turns: readonly AgentSessionTurn[];
}

interface SessionStreamEntry extends SessionStreamState {
  /** Client-side Effect fiber for the active RPC stream. Interrupting it propagates cancellation to the server stream. */
  readonly fiber: AgentRpcClientFiber | null;
}

interface StartSessionStreamInput {
  readonly attachments: readonly AgentSessionAttachment[];
  readonly message: string;
  readonly model: AgentModelReference;
  readonly projectPath: string;
  readonly queryClient: QueryClient;
  readonly rpcClient: AgentRpcClientApi;
  readonly sessionId: string;
  readonly sessionTurns: readonly AgentSessionTurn[];
}

interface SessionStreamStoreState {
  readonly streams: Record<string, SessionStreamEntry | undefined>;
  readonly startStream: (input: StartSessionStreamInput) => void;
  readonly stopAllStreams: () => void;
  readonly stopStream: (sessionId: string) => void;
}

function createStreamId(): string {
  return `stream_${crypto.randomUUID()}`;
}

function attachmentMetadata(attachments: readonly AgentSessionAttachment[]): AgentSessionAttachment[] | undefined {
  if (attachments.length === 0) return undefined;

  return attachments.map((attachment) => ({
    id: attachment.id,
    contentBase64: attachment.contentBase64,
    mime: attachment.mime,
    name: attachment.name,
    size: attachment.size,
  }));
}

/**
 * Creates an optimistic local turn immediately so the user message appears before
 * the server emits the canonical turn snapshot.
 */
function createInitialStreamTurn(input: {attachments: readonly AgentSessionAttachment[]; message: string; model: AgentModelReference}): AgentSessionTurn {
  const timestamp = new Date().toISOString();

  const localMessage: AgentSessionUserMessage = {attachments: attachmentMetadata(input.attachments), content: input.message, id: `msg_${crypto.randomUUID()}`, timestamp};

  return {
    events: [],
    id: localMessage.id,
    model: input.model,
    startedAt: timestamp,
    status: "streaming",
    userMessage: localMessage,
  };
}

/**
 * A streaming turn can create or rename a session. Keep both the open session
 * query and the project session list in sync so sidebar/title UI updates without
 * waiting for a refetch.
 */
function applySessionSummary(input: {projectPath: string; queryClient: QueryClient; sessionId: string; summary: AgentSessionSummary}): void {
  const {projectPath, queryClient, sessionId, summary} = input;

  queryClient.setQueryData<AgentSessionDetails>(sessionQueryKey(sessionId), (session) => (session ? {...session, title: summary.title, updatedAt: summary.updatedAt} : session));
  queryClient.setQueriesData<AgentProjectSessionsListResult>({queryKey: listProjectSessionsQueryKey(projectPath)}, (result) => {
    if (!result) return result;

    const sessionExists = result.sessions.some((session) => session.id === sessionId);
    const sessions = sessionExists
      ? result.sessions.map((session) => (session.id === sessionId ? {...session, title: summary.title, updatedAt: summary.updatedAt} : session))
      : [summary, ...result.sessions];

    return {...result, sessions};
  });
}

/** Writes the latest canonical transcript into React Query. */
function applyDoneTurns(input: {queryClient: QueryClient; sessionId: string; turns: readonly AgentSessionTurn[]}): void {
  const {queryClient, sessionId, turns} = input;
  queryClient.setQueryData<AgentSessionDetails>(sessionQueryKey(sessionId), (session) => (session ? {...session, turns} : session));
}

export const useSessionStreamStore = create<SessionStreamStoreState>()((set, get) => {
  /**
   * All async stream callbacks must pass through this guard. A session can start
   * another stream after a previous one finishes, and stale callbacks from the old
   * fiber must never overwrite the newer stream state.
   */
  const updateStream = (sessionId: string, streamId: string, update: (entry: SessionStreamEntry) => SessionStreamEntry): void => {
    set((state) => {
      const current = state.streams[sessionId];
      if (!current || current.streamId !== streamId) return state;

      return {streams: {...state.streams, [sessionId]: update(current)}};
    });
  };

  /** Normalizes transport/runtime failures into user-visible stream errors. */
  const failStream = (sessionId: string, streamId: string, cause: unknown): void => {
    const error = cause instanceof Error ? cause.message : "Failed to send message.";
    updateStream(sessionId, streamId, (entry) => ({...entry, error, status: "idle", turn: null}));
  };

  /**
   * Final cleanup runs for normal completion, failures, and interruption. When
   * the user stops a stream, the server may not emit a final `done` event, so we
   * commit the partial turn locally before clearing the active stream slot.
   */
  const finishStream = (sessionId: string, streamId: string, queryClient: QueryClient): void => {
    const stream = get().streams[sessionId];
    if (!stream || stream.streamId !== streamId) return;

    const turns = stream.status === "stopping" && stream.turn ? upsertInterruptedTurn(stream.turns, stream.turn) : stream.turns;

    if (turns !== stream.turns) applyDoneTurns({queryClient, sessionId, turns});

    updateStream(sessionId, streamId, (entry) => ({...entry, fiber: null, status: "idle", turn: null, turns}));
    void queryClient.invalidateQueries({queryKey: sessionQueryKey(sessionId)});
  };

  /** Applies server stream events to both transient stream state and cached session data. */
  const handleStreamEvent = (input: {event: AgentSessionStreamEvent; projectPath: string; queryClient: QueryClient; sessionId: string; streamId: string}): void => {
    const {event, projectPath, queryClient, sessionId, streamId} = input;

    switch (event.type) {
      case "ready": {
        // Runtime has loaded the canonical transcript. Replace any stale base
        // turns before appending live streamed updates.
        updateStream(sessionId, streamId, (entry) => ({...entry, turns: event.turns}));
        applyDoneTurns({queryClient, sessionId, turns: event.turns});
        return;
      }
      case "turn": {
        // Turn events are live snapshots. Keep them separate from committed turns
        // so interpolation/rendering can treat the active assistant output as live.
        if (event.session) applySessionSummary({projectPath, queryClient, sessionId, summary: event.session});
        updateStream(sessionId, streamId, (entry) => ({...entry, turn: event.turn}));
        return;
      }
      case "done": {
        // `done` is the canonical transcript after the runtime has persisted the turn.
        applyDoneTurns({queryClient, sessionId, turns: event.turns});
        updateStream(sessionId, streamId, (entry) => ({...entry, status: "idle", turn: null, turns: event.turns}));
        return;
      }
      case "error": {
        updateStream(sessionId, streamId, (entry) => ({...entry, error: event.error, status: "idle", turn: null}));
        return;
      }
    }
  };

  return {
    streams: {},
    startStream: (input) => {
      const {attachments, message, model, projectPath, queryClient, rpcClient, sessionId, sessionTurns} = input;
      const current = get().streams[sessionId];
      if (current?.status === "streaming" || current?.status === "stopping") return;

      const streamId = createStreamId();
      const turn = createInitialStreamTurn({attachments, message, model});

      // Optimistically append the user's message before the RPC stream has fully
      // initialized. The next `ready` event will replace `turns` with runtime data.
      set((state) => ({
        streams: {
          ...state.streams,
          [sessionId]: {error: null, fiber: null, status: "streaming", streamId, turn, turns: sessionTurns},
        },
      }));

      // Keep the RPC stream outside React Query. Query cache stores committed
      // transcript snapshots; Zustand owns the transient live turn and fiber.
      void rpcClient
        .fork((rpc) =>
          rpc.sendSessionMessage({attachments, message, model, sessionId}).pipe(
            Stream.runForEach((event) => Effect.sync(() => handleStreamEvent({event, projectPath, queryClient, sessionId, streamId}))),
            Effect.catch((cause: unknown) => Effect.sync(() => failStream(sessionId, streamId, cause))),
            Effect.ensuring(Effect.sync(() => finishStream(sessionId, streamId, queryClient)))
          )
        )
        .then((fiber) => {
          const entry = get().streams[sessionId];
          if (!entry || entry.streamId !== streamId) {
            // The store moved on before `fork` resolved. Interrupt this orphaned fiber immediately.
            void fiber.interrupt();
            return;
          }

          if (entry.status === "stopping") {
            // The user clicked stop before the fiber handle was available.
            void fiber.interrupt();
            return;
          }

          updateStream(sessionId, streamId, (entry) => ({...entry, fiber}));
        })
        .catch((cause: unknown) => {
          failStream(sessionId, streamId, cause);
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

      // Mark as stopping first so UI disables repeated stop clicks and finishStream
      // knows to preserve the partial turn if no canonical `done` event arrives.
      set((state) => ({streams: {...state.streams, [sessionId]: {...stream, status: "stopping"}}}));
      void stream.fiber?.interrupt();
    },
  };
});
