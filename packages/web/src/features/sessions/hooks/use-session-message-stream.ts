import type {ModelReference, Turn, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import type {LegendListRef} from "@legendapp/list/react";
import {useQueryClient} from "@tanstack/react-query";
import {useRef} from "react";
import {buildSessionTimeline} from "@/features/sessions/lib/timeline/build-session-timeline";
import {useSessionStreamStore} from "@/features/sessions/stores/session-stream-store";
import type {SessionStreamStatus} from "@/features/sessions/stores/session-stream-store";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

interface UseSessionMessageStreamResult {
  committedTimelineItems: readonly SessionTimelineItem[];
  listRef: React.RefObject<LegendListRef | null>;
  liveTimelineItems: readonly SessionTimelineItem[];
  stopStreaming: () => void;
  streamError: string | null;
  streamStatus: SessionStreamStatus;
  submitMessage: (contentParts: readonly UserMessageContentPart[]) => void;
}

interface UseSessionMessageStreamInput {
  projectPath: string;
  sessionId: string;
  sessionTurns: readonly Turn[];
  modelReference: ModelReference | undefined;
}

export function useSessionMessageStream(input: UseSessionMessageStreamInput): UseSessionMessageStreamResult {
  const {modelReference, projectPath, sessionId, sessionTurns} = input;
  const queryClient = useQueryClient();
  const rpcClient = useAgentRpcClient();
  const messagesListRef = useRef<LegendListRef>(null);

  const stream = useSessionStreamStore((state) => state.streams[sessionId]);
  const startStream = useSessionStreamStore((state) => state.startStream);
  const stopStream = useSessionStreamStore((state) => state.stopStream);

  const streamStatus = stream?.status ?? "idle";
  const isStreaming = streamStatus !== "idle";
  const baseTurns = stream?.turns ?? sessionTurns;
  const streamTurn = stream?.turn ?? null;
  const timeline = buildSessionTimeline({live: isStreaming, liveTurn: streamTurn, turns: baseTurns});

  const submitMessage = (contentParts: readonly UserMessageContentPart[]): void => {
    if (isStreaming) return;

    if (!modelReference) {
      // The composer should already be disabled, but keeping this guard prevents
      // callers from starting an invalid stream from routes that load models later.
      return;
    }

    startStream({contentParts, model: modelReference, projectPath, queryClient, rpcClient, sessionId, sessionTurns: baseTurns});
    window.requestAnimationFrame(() => {
      void messagesListRef.current?.scrollToEnd({animated: false});
    });
  };

  const stopStreaming = (): void => {
    stopStream(sessionId);
  };

  return {
    committedTimelineItems: timeline.committedItems,
    listRef: messagesListRef,
    liveTimelineItems: timeline.liveItems,
    stopStreaming,
    streamError: stream?.error ?? null,
    streamStatus,
    submitMessage,
  };
}
