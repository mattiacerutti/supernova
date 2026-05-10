import type {IAgentModelReference, IAgentSessionTurn} from "@pi-desktop/contracts/sessions";
import type {LegendListRef} from "@legendapp/list/react";
import {useQueryClient} from "@tanstack/react-query";
import {useRef} from "react";
import {useSessionStreamStore} from "@/features/sessions/stores/session-stream-store";
import type {SessionStreamStatus} from "@/features/sessions/stores/session-stream-store";
import {turnsToRenderItems} from "@/features/sessions/lib/session-render-items";
import type {SessionRenderItem} from "@/features/sessions/types/session-render-item";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

interface IUseSessionMessageStreamResult {
  renderItems: readonly SessionRenderItem[];
  listRef: React.RefObject<LegendListRef | null>;
  stopStreaming: () => void;
  streamError: string | null;
  streamStatus: SessionStreamStatus;
  submitMessage: (message: string) => void;
}

interface IUseSessionMessageStreamInput {
  projectPath: string;
  sessionId: string;
  sessionTurns: readonly IAgentSessionTurn[];
  modelReference: IAgentModelReference | undefined;
}

export function useSessionMessageStream(input: IUseSessionMessageStreamInput): IUseSessionMessageStreamResult {
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
  const renderItems = [...turnsToRenderItems(baseTurns, false), ...(streamTurn ? turnsToRenderItems([streamTurn], isStreaming) : [])];

  const submitMessage = (message: string): void => {
    if (isStreaming) return;

    if (!modelReference) {
      // The composer should already be disabled, but keeping this guard prevents
      // callers from starting an invalid stream from routes that load models later.
      return;
    }

    startStream({message, model: modelReference, projectPath, queryClient, rpcClient, sessionId, sessionTurns: baseTurns});
    window.requestAnimationFrame(() => {
      void messagesListRef.current?.scrollToEnd({animated: false});
    });
  };

  const stopStreaming = (): void => {
    stopStream(sessionId);
  };

  return {
    renderItems,
    listRef: messagesListRef,
    stopStreaming,
    streamError: stream?.error ?? null,
    streamStatus,
    submitMessage,
  };
}
