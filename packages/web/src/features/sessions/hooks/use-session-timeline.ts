import type {ModelReference, SessionContextUsage, Turn, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {useQueryClient} from "@tanstack/react-query";
import {useMemo, useState} from "react";
import {buildCommittedTimelineItems, buildLiveTimelineItems} from "@/features/sessions/lib/timeline/build-session-timeline";
import type {ClientSlashCommandActions} from "@/features/sessions/lib/composer/client-slash-commands";
import {useGeneralSettingsStore} from "@/features/settings/stores/general-settings-store";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import type {CheckpointNavigationOutcome, SessionLiveStatus} from "@/features/sessions/stores/session-live-store";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

interface UseSessionTimelineResult {
  /** Pending confirmation for a restore that would discard manual workspace changes. */
  readonly checkpointConflict: {readonly cancel: () => void; readonly confirm: () => void; readonly open: boolean};
  committedTimelineItems: readonly SessionTimelineItem[];
  liveContext: SessionContextUsage | null;
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
  const queryClient = useQueryClient();
  const rpcClient = useAgentRpcClient();
  const [forceNavigation, setForceNavigation] = useState<(() => void) | null>(null);

  /** Runs a navigation command and holds its forced retry when the workspace conflicts, or forces immediately when confirmation is off. */
  const navigate = async (run: () => Promise<CheckpointNavigationOutcome>, retryWithForce: () => Promise<CheckpointNavigationOutcome>): Promise<void> => {
    const outcome = await run();
    if (outcome !== "conflict") return;
    if (useGeneralSettingsStore.getState().confirmCheckpointConflicts) setForceNavigation(() => () => void retryWithForce());
    else await retryWithForce();
  };

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

    sendMessage({contentParts, modelReference, queryClient, rpcClient, sessionId});
  };

  const stopStreaming = (): void => {
    abortSession({rpcClient, sessionId});
  };

  const triggerCompaction = (): void => {
    if (streamStatus !== "idle" || !modelReference) return;

    compactSession({modelReference, rpcClient, sessionId});
  };

  const undo = (): void => {
    if (streamStatus !== "idle") return;

    void navigate(
      () => undoCheckpoint({queryClient, rpcClient, sessionId}),
      () => undoCheckpoint({force: true, queryClient, rpcClient, sessionId})
    );
  };

  const redo = (): void => {
    if (streamStatus !== "idle") return;

    void navigate(
      () => redoCheckpoint({queryClient, rpcClient, sessionId}),
      () => redoCheckpoint({force: true, queryClient, rpcClient, sessionId})
    );
  };

  const revertToMessage = (turnId: string): void => {
    if (streamStatus !== "idle") return;

    void navigate(
      () => revertSessionToMessage({queryClient, rpcClient, sessionId, turnId}),
      () => revertSessionToMessage({force: true, queryClient, rpcClient, sessionId, turnId})
    );
  };

  return {
    checkpointConflict: {
      cancel: () => setForceNavigation(null),
      confirm: () => {
        forceNavigation?.();
        setForceNavigation(null);
      },
      open: forceNavigation !== null,
    },
    streamStatus,
    streamError: sessionState?.error ?? null,
    liveContext: sessionState?.liveContext ?? null,
    committedTimelineItems,
    liveTimelineItems,
    slashCommandActions: {compact: triggerCompaction, redo, undo},
    revertToMessage,
    submitMessage,
    stopStreaming,
  };
}
