import type {ModelReference, Turn, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import type {LegendListRef} from "@legendapp/list/react";
import {useMemo, useRef} from "react";
import {buildCommittedTimelineItems, buildLiveTimelineItems} from "@/features/sessions/lib/timeline/build-session-timeline";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import type {SessionLiveStatus} from "@/features/sessions/stores/session-live-store";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

interface UseSessionTimelineResult {
  committedTimelineItems: readonly SessionTimelineItem[];
  listRef: React.RefObject<LegendListRef | null>;
  liveTimelineItems: readonly SessionTimelineItem[];
  stopStreaming: () => void;
  streamError: string | null;
  streamStatus: SessionLiveStatus;
  submitMessage: (contentParts: readonly UserMessageContentPart[]) => void;
}

interface UseSessionTimelineInput {
  sessionId: string;
  sessionTurns: readonly Turn[];
  modelReference: ModelReference | undefined;
}

export function useSessionTimeline(input: UseSessionTimelineInput): UseSessionTimelineResult {
  const {modelReference, sessionId, sessionTurns} = input;
  const rpcClient = useAgentRpcClient();
  const messagesListRef = useRef<LegendListRef>(null);

  const stream = useSessionLiveStore((state) => state.sessions[sessionId]);
  const abortSession = useSessionLiveStore((state) => state.abortSession);
  const sendMessage = useSessionLiveStore((state) => state.sendMessage);

  const streamStatus = stream?.status ?? "idle";
  const isStreaming = streamStatus !== "idle";
  const streamTurn = stream?.liveTurn ?? null;
  const committedTimelineItems = useMemo(() => buildCommittedTimelineItems(sessionTurns), [sessionTurns]);
  const liveTimelineItems = useMemo(() => buildLiveTimelineItems({live: isStreaming, liveTurn: streamTurn}), [isStreaming, streamTurn]);

  const submitMessage = (contentParts: readonly UserMessageContentPart[]): void => {
    if (isStreaming) return;

    if (!modelReference) {
      // The composer should already be disabled, but keeping this guard prevents
      // callers from starting an invalid stream from routes that load models later.
      return;
    }

    sendMessage({contentParts, model: modelReference, rpcClient, sessionId});
    window.requestAnimationFrame(() => {
      void messagesListRef.current?.scrollToEnd({animated: false});
    });
  };

  const stopStreaming = (): void => {
    abortSession({rpcClient, sessionId});
  };

  return {
    streamStatus,
    streamError: stream?.error ?? null,
    committedTimelineItems,
    liveTimelineItems,
    submitMessage,
    stopStreaming,
    listRef: messagesListRef,
  };
}
