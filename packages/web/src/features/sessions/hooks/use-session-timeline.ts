import type {ModelReference, Turn, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import type {LegendListRef} from "@legendapp/list/react";
import {useMemo, useRef} from "react";
import {buildCommittedTimelineItems, buildLiveTimelineItems} from "@/features/sessions/lib/timeline/build-session-timeline";
import type {ClientSlashCommandActions} from "@/features/sessions/lib/composer/client-slash-commands";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import type {SessionLiveStatus} from "@/features/sessions/stores/session-live-store";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

interface UseSessionTimelineResult {
  committedTimelineItems: readonly SessionTimelineItem[];
  listRef: React.RefObject<LegendListRef | null>;
  liveTimelineItems: readonly SessionTimelineItem[];
  slashCommandActions: ClientSlashCommandActions;
  stopStreaming: () => void;
  streamError: string | null;
  readonly streamStatus: SessionLiveStatus;
  readonly revertToMessage: (turnId: string) => void;
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

  const sessionState = useSessionLiveStore((state) => state.sessions[sessionId]);
  const abortSession = useSessionLiveStore((state) => state.abortSession);
  const compactSession = useSessionLiveStore((state) => state.compactSession);
  const redoCheckpoint = useSessionLiveStore((state) => state.redoCheckpoint);
  const revertSessionToMessage = useSessionLiveStore((state) => state.revertToMessage);
  const sendMessage = useSessionLiveStore((state) => state.sendMessage);
  const undoCheckpoint = useSessionLiveStore((state) => state.undoCheckpoint);

  const streamStatus = sessionState?.status ?? "idle";
  const streamTurn = sessionState?.liveTurn ?? null;
  const committedTimelineItems = useMemo(() => buildCommittedTimelineItems(sessionTurns), [sessionTurns]);

  const liveTimelineItems = useMemo(
    () => buildLiveTimelineItems({live: streamStatus === "streaming" || streamStatus === "compacting", liveTurn: streamTurn}),
    [streamStatus, streamTurn]
  );

  const submitMessage = (contentParts: readonly UserMessageContentPart[]): void => {
    if (streamStatus !== "idle") return;

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

  const triggerCompaction = (): void => {
    if (streamStatus !== "idle" || !modelReference) return;

    compactSession({model: modelReference, rpcClient, sessionId});
  };

  const undo = (): void => {
    if (streamStatus !== "idle") return;

    undoCheckpoint({rpcClient, sessionId});
  };

  const redo = (): void => {
    if (streamStatus !== "idle") return;

    redoCheckpoint({rpcClient, sessionId});
  };

  const revertToMessage = (turnId: string): void => {
    if (streamStatus !== "idle") return;

    revertSessionToMessage({rpcClient, sessionId, turnId});
  };

  return {
    streamStatus,
    streamError: sessionState?.error ?? null,
    committedTimelineItems,
    liveTimelineItems,
    slashCommandActions: {compact: triggerCompaction, redo, undo},
    revertToMessage,
    submitMessage,
    stopStreaming,
    listRef: messagesListRef,
  };
}
