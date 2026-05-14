import type {AgentModelReference, AgentSessionAttachment, AgentSessionTurn} from "@pi-desktop/contracts/sessions/schemas";
import type {LegendListRef} from "@legendapp/list/react";
import {useQueryClient} from "@tanstack/react-query";
import {useRef} from "react";
import {useSessionStreamStore} from "@/features/sessions/stores/session-stream-store";
import type {SessionStreamStatus} from "@/features/sessions/stores/session-stream-store";
import {turnsToRenderItems} from "@/features/sessions/lib/session-render-items";
import type {SessionRenderItem} from "@/features/sessions/types/session-render-item";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

interface UseSessionMessageStreamResult {
  committedRenderItems: readonly SessionRenderItem[];
  listRef: React.RefObject<LegendListRef | null>;
  liveRenderItems: readonly SessionRenderItem[];
  stopStreaming: () => void;
  streamError: string | null;
  streamStatus: SessionStreamStatus;
  submitMessage: (message: string, attachments: readonly AgentSessionAttachment[]) => void;
}

interface UseSessionMessageStreamInput {
  projectPath: string;
  sessionId: string;
  sessionTurns: readonly AgentSessionTurn[];
  modelReference: AgentModelReference | undefined;
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
  const committedRenderItems = turnsToRenderItems(baseTurns, false);
  const liveRenderItems = streamTurn ? turnsToRenderItems([streamTurn], isStreaming) : [];

  const submitMessage = (message: string, attachments: readonly AgentSessionAttachment[]): void => {
    if (isStreaming) return;

    if (!modelReference) {
      // The composer should already be disabled, but keeping this guard prevents
      // callers from starting an invalid stream from routes that load models later.
      return;
    }

    startStream({attachments, message, model: modelReference, projectPath, queryClient, rpcClient, sessionId, sessionTurns: baseTurns});
    window.requestAnimationFrame(() => {
      void messagesListRef.current?.scrollToEnd({animated: false});
    });
  };

  const stopStreaming = (): void => {
    stopStream(sessionId);
  };

  return {
    committedRenderItems,
    listRef: messagesListRef,
    liveRenderItems,
    stopStreaming,
    streamError: stream?.error ?? null,
    streamStatus,
    submitMessage,
  };
}
