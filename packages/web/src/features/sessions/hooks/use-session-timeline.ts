import type {ModelReference, SessionContextUsage, Turn, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {useQueryClient} from "@tanstack/react-query";
import {useMemo, useRef, useState} from "react";
import {buildCommittedTimelineItems, buildLiveTimelineItems} from "@/features/sessions/lib/timeline/build-session-timeline";
import type {ClientSlashCommandActions} from "@/features/sessions/lib/composer/client-slash-commands";
import {useGeneralSettingsStore} from "@/features/settings/stores/general-settings-store";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import type {CheckpointNavigationConfirmation, CheckpointNavigationOutcome, SessionLiveStatus} from "@/features/sessions/stores/session-live-store";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {useRpcClient} from "@/rpc/use-rpc-client";
import {useMountEffect} from "@/lib/use-mount-effect";

interface UseSessionTimelineResult {
  /** Pending confirmation for a restore that would discard manual workspace changes. */
  readonly checkpointConflict: {readonly cancel: () => void; readonly confirm: () => void; readonly open: boolean; readonly reason: "conflict" | "uncaptured"};
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
  const rpcClient = useRpcClient();
  const [confirmation, setConfirmation] = useState<{readonly open: boolean; readonly reason: "conflict" | "uncaptured"}>({open: false, reason: "conflict"});
  const pendingConfirmation = useRef<CheckpointNavigationConfirmation | null>(null);
  const mounted = useRef(true);

  useMountEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingConfirmation.current?.cancel();
      pendingConfirmation.current = null;
    };
  });

  /** Keeps the optimistic timeline until the user decides, or retries immediately when confirmation is off. */
  const navigate = async (run: () => Promise<CheckpointNavigationOutcome>): Promise<void> => {
    const outcome = await run();
    if (typeof outcome === "string") return;
    if (!mounted.current) {
      outcome.cancel();
      return;
    }
    if (useGeneralSettingsStore.getState().confirmCheckpointConflicts) {
      pendingConfirmation.current = outcome;
      setConfirmation({open: true, reason: outcome.reason});
    } else await outcome.confirm();
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

    void navigate(() => undoCheckpoint({queryClient, rpcClient, sessionId}));
  };

  const redo = (): void => {
    if (streamStatus !== "idle") return;

    void navigate(() => redoCheckpoint({queryClient, rpcClient, sessionId}));
  };

  const revertToMessage = (turnId: string): void => {
    if (streamStatus !== "idle") return;

    void navigate(() => revertSessionToMessage({queryClient, rpcClient, sessionId, turnId}));
  };

  return {
    checkpointConflict: {
      cancel: () => {
        pendingConfirmation.current?.cancel();
        pendingConfirmation.current = null;
        setConfirmation((current) => ({...current, open: false}));
      },
      confirm: () => {
        void pendingConfirmation.current?.confirm();
        pendingConfirmation.current = null;
        setConfirmation((current) => ({...current, open: false}));
      },
      open: confirmation.open,
      reason: confirmation.reason,
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
