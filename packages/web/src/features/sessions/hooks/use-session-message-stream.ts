import type {AgentSessionStreamEvent, IAgentModelReference, IAgentSessionTurn, IAgentSessionUserMessage} from "@pi-desktop/contracts/sessions";
import type {LegendListRef} from "@legendapp/list/react";
import {useCallback, useMemo, useRef, useState} from "react";
import {useSendSessionMessage} from "@/features/sessions/hooks/api/use-send-session-message";
import {turnsToRenderItems} from "@/features/sessions/lib/session-render-items";
import {interpolateStreamTurn, STREAM_FRAME_MAX_DELTA_MS} from "@/features/sessions/lib/stream-interpolation";
import type {SessionRenderItem} from "@/features/sessions/types/session-render-item";

interface IUseSessionMessageStreamResult {
  renderItems: readonly SessionRenderItem[];
  isStreaming: boolean;
  listRef: React.RefObject<LegendListRef | null>;
  streamError: string | null;
  submitMessage: (message: string) => void;
}

interface IIdleStreamState {
  status: "idle";
  turns: readonly IAgentSessionTurn[];
}

interface IStreamingStreamState {
  status: "streaming";
  // Frozen transcript snapshot before the live turn; keeping it separate prevents query refetches from duplicating or reordering streamed content.
  turns: readonly IAgentSessionTurn[];
  startedAt: number;
  turn: IAgentSessionTurn;
}

type StreamState = IIdleStreamState | IStreamingStreamState;

interface ISmoothStreamingTurnInput {
  onTurn: (turn: IAgentSessionTurn) => void;
}

interface ISmoothStreamingTurnResult {
  push: (turn: IAgentSessionTurn) => void;
  reset: () => void;
  start: (turn: IAgentSessionTurn) => void;
}

function useSmoothStreamingTurn(input: ISmoothStreamingTurnInput): ISmoothStreamingTurnResult {
  const scheduledFrameRef = useRef<number | null>(null);
  const previousFrameTimestampRef = useRef<number | null>(null);

  const streamRenderedTurnRef = useRef<IAgentSessionTurn | null>(null);
  const streamTargetTurnRef = useRef<IAgentSessionTurn | null>(null);

  const cancelFrame = (): void => {
    if (scheduledFrameRef.current === null) return;
    window.cancelAnimationFrame(scheduledFrameRef.current);
    scheduledFrameRef.current = null;
  };

  const reset = (): void => {
    cancelFrame();
    streamRenderedTurnRef.current = null;
    streamTargetTurnRef.current = null;
    previousFrameTimestampRef.current = null;
  };

  const schedule = (): void => {
    if (scheduledFrameRef.current !== null) return;

    const renderFrame = (frameAt: number): void => {
      scheduledFrameRef.current = null;

      const targetTurn = streamTargetTurnRef.current;
      if (!targetTurn) return;

      // If this is the first frame, we use 16ms which corresponds to ~60fps
      const elapsedMs = Math.min(STREAM_FRAME_MAX_DELTA_MS, previousFrameTimestampRef.current === null ? 16 : frameAt - previousFrameTimestampRef.current);
      previousFrameTimestampRef.current = frameAt;

      const currentTurn = streamRenderedTurnRef.current;
      const nextTurnResult = interpolateStreamTurn(currentTurn, targetTurn, elapsedMs);

      const nextTurn = nextTurnResult.done ? targetTurn : nextTurnResult.turn;
      streamRenderedTurnRef.current = nextTurn;

      if (nextTurnResult.changed || currentTurn !== nextTurn) input.onTurn(nextTurn);
      if (!nextTurnResult.done) {
        scheduledFrameRef.current = window.requestAnimationFrame(renderFrame);
      }
    };

    scheduledFrameRef.current = window.requestAnimationFrame(renderFrame);
  };

  return {
    push(turn: IAgentSessionTurn): void {
      // Keep only the latest target turn while a frame is pending. The scheduled
      // frame reads this ref when it runs, so rapid stream updates coalesce without
      // rendering stale intermediate turns.
      streamTargetTurnRef.current = turn;
      schedule();
    },
    reset,
    start(turn: IAgentSessionTurn): void {
      reset();
      streamRenderedTurnRef.current = turn;
    },
  };
}

interface IUseSessionMessageStreamInput {
  sessionId: string;
  sessionTurns: readonly IAgentSessionTurn[];
  modelReference: IAgentModelReference | undefined;
}
export function useSessionMessageStream(input: IUseSessionMessageStreamInput): IUseSessionMessageStreamResult {
  const {modelReference, sessionId, sessionTurns} = input;
  const sendMessageMutation = useSendSessionMessage();

  const messagesListRef = useRef<LegendListRef>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<StreamState>({status: "idle", turns: sessionTurns});

  const baseTurns = streamState.turns;
  const isStreaming = streamState.status === "streaming";
  const streamTurn = isStreaming ? streamState.turn : null;

  const baseRenderItems = useMemo(() => turnsToRenderItems(baseTurns, false), [baseTurns]);
  const streamRenderItems = useMemo(() => (streamTurn ? turnsToRenderItems([streamTurn], isStreaming) : []), [isStreaming, streamTurn]);
  const renderItems = [...baseRenderItems, ...streamRenderItems];

  const forceScrollToBottom = useCallback((): void => {
    // If there's already a scheduled scroll, do nothing, as it will scroll to the bottom at the right time.
    // This prevents scheduling multiple redundant scrolls when many messages are received in a short time.
    if (scrollAnimationFrameRef.current !== null) return;

    scrollAnimationFrameRef.current = window.requestAnimationFrame(() => {
      scrollAnimationFrameRef.current = null;
      void messagesListRef.current?.scrollToEnd({animated: false});
    });
  }, []);

  const smoothStreamingTurn = useSmoothStreamingTurn({
    onTurn: (turn) => {
      setStreamState((current) => (current.status === "streaming" ? {...current, turn} : current));
    },
  });

  const finishStream = (): void => {
    smoothStreamingTurn.reset();
    setStreamState((current) => {
      if (current.status !== "streaming") return current;
      return {status: "idle", turns: current.turns};
    });
  };

  const handleStreamEvent = (event: AgentSessionStreamEvent): void => {
    if (event.type === "ready") {
      // When `ready` event is received, the local state should be streaming since we optimistically add the user message.
      // This is done to reconcile the server-confirmed turns with the local state
      setStreamState((current) => (current.status === "streaming" ? {...current, turns: event.turns} : current));
      return;
    }

    if (event.type === "turn") {
      smoothStreamingTurn.push(event.turn);
      return;
    }

    if (event.type === "done") {
      setStreamState({status: "idle", turns: event.turns});
    }

    if (event.type === "error") {
      setStreamError(event.error);
    }

    finishStream();
  };

  const submitMessage = (message: string): void => {
    if (isStreaming) return;

    if (!modelReference) {
      setStreamError("Select a model before sending.");
      return;
    }

    // Optimistically enters in streaming state with user message and render the submitted message
    // so the composer feels responsive while the server opens the Pi stream.
    const localMessage: IAgentSessionUserMessage = {content: message, id: `local-${Date.now()}`, timestamp: new Date().toISOString()};
    const initialStreamTurn: IAgentSessionTurn = {
      events: [],
      id: `turn-${localMessage.id}`,
      model: modelReference,
      startedAt: localMessage.timestamp,
      status: "streaming",
      userMessage: localMessage,
    };
    smoothStreamingTurn.start(initialStreamTurn);

    setStreamState((current) => ({
      startedAt: Date.now(),
      status: "streaming",
      turn: initialStreamTurn,
      turns: current.turns,
    }));
    setStreamError(null);

    forceScrollToBottom();

    sendMessageMutation.mutate(
      {
        message,
        model: modelReference,
        onEvent: handleStreamEvent,
        sessionId,
      },
      {
        onError: (cause) => setStreamError(cause instanceof Error ? cause.message : "Failed to send message."),
        onSettled: finishStream,
      }
    );
  };

  return {
    renderItems,
    isStreaming,
    listRef: messagesListRef,
    streamError,
    submitMessage,
  };
}
