import type {ModelReference, SessionContextUsage, Turn, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {useMemo, useRef, useState} from "react";
import {buildCommittedTimelineItems, buildLiveTimelineItems} from "@/features/sessions/lib/timeline/rows/build-session-timeline";
import type {ClientSlashCommandActions} from "@/features/sessions/lib/composer/editor/client-slash-commands";
import {useSettingsStore} from "@/stores/settings-store";
import {useSessionActions} from "@/features/sessions/api/conversation/session-actions";
import {useSessionLiveStore} from "@/features/sessions/stores/conversation/session-live-store";
import type {CheckpointNavigationConfirmation, CheckpointNavigationOutcome, SessionLiveStatus} from "@/features/sessions/stores/conversation/session-live-store";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {useMountEffect} from "@/hooks/use-mount-effect";

interface UseSessionTimelineResult {
  /** Pending confirmation for a restore that would discard manual workspace changes. */
  readonly checkpointConflict: {readonly cancel: () => void; readonly confirm: () => void; readonly open: boolean; readonly reason: "conflict" | "uncaptured"};
  readonly committedTimelineItems: readonly SessionTimelineItem[];
  readonly liveContext: SessionContextUsage | null;
  readonly liveTimelineItems: readonly SessionTimelineItem[];
  readonly slashCommandActions: ClientSlashCommandActions;
  readonly stopStreaming: () => void;
  readonly streamError: string | null;
  readonly streamStatus: SessionLiveStatus;
  readonly revertToMessage: (turnId: string) => void;
  readonly submitMessage: (contentParts: readonly UserMessageContentPart[]) => void;
}

interface UseSessionTimelineOptions {
  readonly sessionId: string;
  readonly sessionTurns: readonly Turn[];
  readonly modelReference: ModelReference | undefined;
}

export function useSessionTimeline(options: UseSessionTimelineOptions): UseSessionTimelineResult {
  const {modelReference, sessionId, sessionTurns} = options;
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
    if (useSettingsStore.getState().confirmCheckpointConflicts) {
      pendingConfirmation.current = outcome;
      setConfirmation({open: true, reason: outcome.reason});
    } else await outcome.confirm();
  };

  const sessionState = useSessionLiveStore((state) => state.sessions[sessionId]);
  const actions = useSessionActions();

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

    actions.sendMessage({contentParts, modelReference, sessionId});
  };

  const stopStreaming = (): void => {
    actions.abortSession({sessionId});
  };

  const triggerCompaction = (): void => {
    if (streamStatus !== "idle" || !modelReference) return;

    actions.compactSession({modelReference, sessionId});
  };

  const undo = (): void => {
    if (streamStatus !== "idle") return;

    void navigate(() => actions.undoCheckpoint({sessionId}));
  };

  const redo = (): void => {
    if (streamStatus !== "idle") return;

    void navigate(() => actions.redoCheckpoint({sessionId}));
  };

  const revertToMessage = (turnId: string): void => {
    if (streamStatus !== "idle") return;

    void navigate(() => actions.revertToMessage({sessionId, turnId}));
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
